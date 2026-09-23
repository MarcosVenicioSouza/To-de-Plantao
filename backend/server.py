from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET') or ''
if not JWT_SECRET or len(JWT_SECRET) < 32:
    raise RuntimeError(
        'JWT_SECRET is missing or too short (min 32 chars). Refuse to start.'
    )
JWT_ALG = 'HS256'
JWT_EXP_DAYS = 30

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ============ Models ============
ShiftType = Literal['SD', 'SN', 'FOLGA', 'AVULSO', 'FERIAS', 'MANHA', 'TARDE']
CyclePattern = Literal['SD_F_SN_F_F', 'SD_SN_F_F', 'SD_F_SN_F', 'SD_F_F_SN_F_F', 'SD_F_F_SD_F_F']  # 5-day, 4-day back-to-back, legacy 4-day 12x36, 6-day with double folgas, 6-day same-shift


class RegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = 'bearer'


class PublicUser(BaseModel):
    id: str
    name: str
    email: EmailStr


class VacationPeriod(BaseModel):
    start: str  # YYYY-MM-DD
    end: str


class WorkplaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(default='#32827A')
    cycle_pattern: CyclePattern = 'SD_F_SN_F_F'
    cycle_start_date: str
    cycle_start_shift: Literal['SD', 'SN'] = 'SD'
    sd_start: str = '07:00'
    sd_end: str = '19:00'
    sn_start: str = '19:00'
    sn_end: str = '07:00'
    shift_day_color: str = '#007AFF'
    shift_night_color: str = '#FF3B30'
    avulso_color: str = '#34C759'
    manha_color: str = '#FFCC00'
    tarde_color: str = '#FF9500'
    is_avulso_only: bool = False
    vacations: List[VacationPeriod] = []


class WorkplaceUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    cycle_pattern: Optional[CyclePattern] = None
    cycle_start_date: Optional[str] = None
    cycle_start_shift: Optional[Literal['SD', 'SN']] = None
    sd_start: Optional[str] = None
    sd_end: Optional[str] = None
    sn_start: Optional[str] = None
    sn_end: Optional[str] = None
    shift_day_color: Optional[str] = None
    shift_night_color: Optional[str] = None
    avulso_color: Optional[str] = None
    manha_color: Optional[str] = None
    tarde_color: Optional[str] = None
    is_avulso_only: Optional[bool] = None
    vacations: Optional[List[VacationPeriod]] = None


class Workplace(BaseModel):
    id: str
    user_id: str
    name: str
    color: str
    cycle_pattern: CyclePattern
    cycle_start_date: str
    cycle_start_shift: Literal['SD', 'SN']
    sd_start: str
    sd_end: str
    sn_start: str
    sn_end: str
    shift_day_color: str
    shift_night_color: str
    avulso_color: str
    manha_color: str
    tarde_color: str
    is_avulso_only: bool
    vacations: List[VacationPeriod]
    created_at: str


class ShiftOverride(BaseModel):
    id: str
    user_id: str
    workplace_id: str
    date: str
    shift_type: ShiftType
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    note: Optional[str] = None
    swap_with: Optional[str] = None
    updated_at: str


class ShiftOverrideBody(BaseModel):
    shift_type: ShiftType
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    note: Optional[str] = None
    swap_with: Optional[str] = None


class HolidayCreate(BaseModel):
    date: str
    name: str = Field(min_length=1, max_length=80)


class Holiday(BaseModel):
    id: str
    user_id: str
    date: str
    name: str


class ExtraEventCreate(BaseModel):
    date: str
    label: str = Field(min_length=1, max_length=40)
    color: str = "#34C759"
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    note: Optional[str] = None


class ExtraEventUpdate(BaseModel):
    date: Optional[str] = None
    label: Optional[str] = None
    color: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    note: Optional[str] = None


class ExtraEvent(BaseModel):
    id: str
    user_id: str
    date: str
    label: str
    color: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    note: Optional[str] = None
    created_at: str


# ============ Auth ============
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def make_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {'sub': user_id, 'iat': int(now.timestamp()),
         'exp': int((now + timedelta(days=JWT_EXP_DAYS)).timestamp())},
        JWT_SECRET, algorithm=JWT_ALG,
    )


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='Não autenticado')
    token = authorization.split(' ', 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get('sub')
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail='Token inválido ou expirado')
    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user or user.get('deleted_at'):
        raise HTTPException(status_code=401, detail='Usuário não encontrado')
    return user


def wp_defaults(doc: dict) -> dict:
    doc.setdefault('cycle_pattern', 'SD_F_SN_F_F')
    doc.setdefault('avulso_color', '#34C759')
    doc.setdefault('manha_color', '#FFCC00')
    doc.setdefault('tarde_color', '#FF9500')
    doc.setdefault('is_avulso_only', False)
    doc.setdefault('vacations', [])
    return doc


# ============ Auth Routes ============
@api_router.post('/auth/register', response_model=Token, status_code=201)
async def register(body: RegisterBody):
    email = body.email.lower().strip()
    if await db.users.find_one({'email': email}, {'_id': 0}):
        raise HTTPException(status_code=400, detail='E-mail já cadastrado')
    user_id = str(uuid.uuid4())
    await db.users.insert_one({
        'id': user_id, 'name': body.name.strip(), 'email': email,
        'password_hash': hash_password(body.password),
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    return Token(access_token=make_token(user_id))


@api_router.post('/auth/login', response_model=Token)
async def login(body: LoginBody):
    email = body.email.lower().strip()
    user = await db.users.find_one({'email': email}, {'_id': 0})
    if not user or not verify_password(body.password, user['password_hash']):
        raise HTTPException(status_code=401, detail='E-mail ou senha incorretos')
    return Token(access_token=make_token(user['id']))


@api_router.get('/auth/me', response_model=PublicUser)
async def me(user=Depends(get_current_user)):
    return PublicUser(id=user['id'], name=user['name'], email=user['email'])


@api_router.delete('/auth/me', status_code=204)
async def delete_me(user=Depends(get_current_user)):
    uid = user['id']
    # Anonymize the user record (soft-delete pattern) so a fresh sign-up can reuse the e-mail.
    await db.users.update_one(
        {'id': uid},
        {
            '$set': {
                'deleted_at': datetime.now(timezone.utc).isoformat(),
                'email': f'deleted-{uid}@deleted.local',
                'password_hash': '',
                'name': 'Conta excluída',
            }
        },
    )
    # Remove owned data.
    await db.workplaces.delete_many({'user_id': uid})
    await db.shift_overrides.delete_many({'user_id': uid})
    await db.holidays.delete_many({'user_id': uid})
    await db.extra_events.delete_many({'user_id': uid})
    return None


# ============ Workplaces ============
@api_router.get('/workplaces', response_model=List[Workplace])
async def list_workplaces(user=Depends(get_current_user)):
    docs = await db.workplaces.find({'user_id': user['id']}, {'_id': 0}).to_list(500)
    return [Workplace(**wp_defaults(d)) for d in docs]


@api_router.post('/workplaces', response_model=Workplace, status_code=201)
async def create_workplace(body: WorkplaceCreate, user=Depends(get_current_user)):
    wid = str(uuid.uuid4())
    doc = {
        'id': wid, 'user_id': user['id'],
        'name': body.name.strip(), 'color': body.color,
        'cycle_pattern': body.cycle_pattern,
        'cycle_start_date': body.cycle_start_date,
        'cycle_start_shift': body.cycle_start_shift,
        'sd_start': body.sd_start, 'sd_end': body.sd_end,
        'sn_start': body.sn_start, 'sn_end': body.sn_end,
        'shift_day_color': body.shift_day_color,
        'shift_night_color': body.shift_night_color,
        'avulso_color': body.avulso_color,
        'manha_color': body.manha_color,
        'tarde_color': body.tarde_color,
        'is_avulso_only': body.is_avulso_only,
        'vacations': [v.model_dump() for v in body.vacations],
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.workplaces.insert_one(doc)
    return Workplace(**wp_defaults(doc))


@api_router.put('/workplaces/{wid}', response_model=Workplace)
async def update_workplace(wid: str, body: WorkplaceUpdate, user=Depends(get_current_user)):
    existing = await db.workplaces.find_one({'id': wid, 'user_id': user['id']}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Local não encontrado')
    updates = {}
    for k, v in body.model_dump().items():
        if v is None:
            continue
        if k == 'vacations':
            updates[k] = [x for x in v]
        else:
            updates[k] = v
    if updates:
        await db.workplaces.update_one({'id': wid, 'user_id': user['id']}, {'$set': updates})
        existing.update(updates)
    return Workplace(**wp_defaults(existing))


@api_router.delete('/workplaces/{wid}', status_code=204)
async def delete_workplace(wid: str, user=Depends(get_current_user)):
    r = await db.workplaces.delete_one({'id': wid, 'user_id': user['id']})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Local não encontrado')
    await db.shift_overrides.delete_many({'workplace_id': wid, 'user_id': user['id']})
    return None


# ============ Shift Overrides ============
@api_router.get('/shifts/{wid}', response_model=List[ShiftOverride])
async def list_overrides(wid: str, year: Optional[int] = None, month: Optional[int] = None, user=Depends(get_current_user)):
    q: dict = {'user_id': user['id'], 'workplace_id': wid}
    if year and month:
        q['date'] = {'$regex': f'^{year:04d}-{month:02d}-'}
    docs = await db.shift_overrides.find(q, {'_id': 0}).to_list(2000)
    return [ShiftOverride(**d) for d in docs]


@api_router.put('/shifts/{wid}/{date}', response_model=ShiftOverride)
async def upsert_override(wid: str, date: str, body: ShiftOverrideBody, user=Depends(get_current_user)):
    wp = await db.workplaces.find_one({'id': wid, 'user_id': user['id']}, {'_id': 0})
    if not wp:
        raise HTTPException(status_code=404, detail='Local não encontrado')
    doc = {
        'id': str(uuid.uuid4()), 'user_id': user['id'], 'workplace_id': wid,
        'date': date, 'shift_type': body.shift_type,
        'start_time': body.start_time, 'end_time': body.end_time,
        'note': body.note, 'swap_with': body.swap_with,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    existing = await db.shift_overrides.find_one(
        {'user_id': user['id'], 'workplace_id': wid, 'date': date}, {'_id': 0}
    )
    if existing:
        doc['id'] = existing['id']
        await db.shift_overrides.update_one(
            {'user_id': user['id'], 'workplace_id': wid, 'date': date},
            {'$set': {k: v for k, v in doc.items() if k != 'id'}},
        )
    else:
        await db.shift_overrides.insert_one(doc)
    return ShiftOverride(**doc)


@api_router.delete('/shifts/{wid}/{date}', status_code=204)
async def delete_override(wid: str, date: str, user=Depends(get_current_user)):
    await db.shift_overrides.delete_one(
        {'user_id': user['id'], 'workplace_id': wid, 'date': date}
    )
    return None


# ============ Custom Holidays ============
@api_router.get('/holidays', response_model=List[Holiday])
async def list_holidays(user=Depends(get_current_user)):
    docs = await db.holidays.find({'user_id': user['id']}, {'_id': 0}).to_list(500)
    return [Holiday(**d) for d in docs]


@api_router.post('/holidays', response_model=Holiday, status_code=201)
async def create_holiday(body: HolidayCreate, user=Depends(get_current_user)):
    hid = str(uuid.uuid4())
    doc = {'id': hid, 'user_id': user['id'], 'date': body.date, 'name': body.name.strip()}
    await db.holidays.insert_one(doc)
    return Holiday(**doc)


@api_router.delete('/holidays/{hid}', status_code=204)
async def delete_holiday(hid: str, user=Depends(get_current_user)):
    await db.holidays.delete_one({'id': hid, 'user_id': user['id']})
    return None


# ============ Extra Events (plantão aleatório) ============
@api_router.get('/events', response_model=List[ExtraEvent])
async def list_events(year: Optional[int] = None, month: Optional[int] = None, user=Depends(get_current_user)):
    q: dict = {'user_id': user['id']}
    if year and month:
        q['date'] = {'$regex': f'^{year:04d}-{month:02d}-'}
    docs = await db.extra_events.find(q, {'_id': 0}).to_list(2000)
    return [ExtraEvent(**d) for d in docs]


@api_router.post('/events', response_model=ExtraEvent, status_code=201)
async def create_event(body: ExtraEventCreate, user=Depends(get_current_user)):
    eid = str(uuid.uuid4())
    doc = {
        'id': eid, 'user_id': user['id'],
        'date': body.date, 'label': body.label.strip(), 'color': body.color,
        'start_time': body.start_time, 'end_time': body.end_time,
        'note': body.note,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await db.extra_events.insert_one(doc)
    return ExtraEvent(**doc)


@api_router.put('/events/{eid}', response_model=ExtraEvent)
async def update_event(eid: str, body: ExtraEventUpdate, user=Depends(get_current_user)):
    existing = await db.extra_events.find_one({'id': eid, 'user_id': user['id']}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Evento não encontrado')
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        if 'label' in updates:
            updates['label'] = updates['label'].strip()
        await db.extra_events.update_one({'id': eid, 'user_id': user['id']}, {'$set': updates})
        existing.update(updates)
    return ExtraEvent(**existing)


@api_router.delete('/events/{eid}', status_code=204)
async def delete_event(eid: str, user=Depends(get_current_user)):
    await db.extra_events.delete_one({'id': eid, 'user_id': user['id']})
    return None


@api_router.get('/')
async def root():
    return {'app': 'EscalaFácil API', 'ok': True}


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=False, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index('email', unique=True)
        await db.workplaces.create_index([('user_id', 1)])
        await db.shift_overrides.create_index(
            [('user_id', 1), ('workplace_id', 1), ('date', 1)], unique=True
        )
        await db.holidays.create_index([('user_id', 1), ('date', 1)])
    except Exception as e:
        logger.warning(f'index warn: {e}')


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
