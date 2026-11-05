"""Tô de Plantão backend.

Data now lives in Supabase. This service only:
  * sends Web Push reminders (1h before each shift) for the PWA;
  * exports a user's data from the old MongoDB database so the app can
    import it into Supabase (matched by e-mail).
Every request is authenticated with the user's Supabase access token.
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pywebpush import WebPushException, webpush
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

SUPABASE_URL = os.environ['SUPABASE_URL'].strip('"').rstrip('/')
SUPABASE_ANON_KEY = os.environ['SUPABASE_ANON_KEY'].strip('"')
VAPID_PUBLIC_KEY = os.environ['VAPID_PUBLIC_KEY']
VAPID_PRIVATE_KEY = os.environ['VAPID_PRIVATE_KEY']
VAPID_SUBJECT = os.environ.get('VAPID_SUBJECT', 'mailto:admin@example.com')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ============ Auth (Supabase token) ============
async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='Não autenticado')
    token = authorization.split(' ', 1)[1].strip()
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.get(
            f'{SUPABASE_URL}/auth/v1/user',
            headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {token}'},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail='Sessão inválida ou expirada')
    data = r.json()
    return {'id': data['id'], 'email': (data.get('email') or '').lower()}


# ============ Web Push ============
class Reminder(BaseModel):
    at: datetime  # ISO with timezone (UTC)
    title: str = Field(max_length=120)
    body: str = Field(max_length=240)


class PushSyncBody(BaseModel):
    subscription: dict
    reminders: List[Reminder] = Field(default_factory=list, max_length=500)


class PushDisableBody(BaseModel):
    endpoint: Optional[str] = None


@api_router.get('/push/public-key')
async def push_public_key():
    return {'public_key': VAPID_PUBLIC_KEY}


@api_router.post('/push/sync')
async def push_sync(body: PushSyncBody, user=Depends(get_current_user)):
    endpoint = body.subscription.get('endpoint')
    if not endpoint:
        raise HTTPException(status_code=400, detail='Inscrição inválida')
    now = datetime.now(timezone.utc)
    await db.push_subscriptions.update_one(
        {'user_id': user['id'], 'endpoint': endpoint},
        {'$set': {'subscription': body.subscription, 'updated_at': now}},
        upsert=True,
    )
    # Replace all pending reminders for this user.
    await db.push_reminders.delete_many({'user_id': user['id'], 'sent': False})
    docs = [
        {'user_id': user['id'], 'at': r.at.astimezone(timezone.utc), 'title': r.title,
         'body': r.body, 'sent': False}
        for r in body.reminders if r.at.astimezone(timezone.utc) > now
    ]
    if docs:
        await db.push_reminders.insert_many(docs)
    return {'scheduled': len(docs)}


@api_router.post('/push/disable')
async def push_disable(body: PushDisableBody, user=Depends(get_current_user)):
    q = {'user_id': user['id']}
    if body.endpoint:
        q['endpoint'] = body.endpoint
    await db.push_subscriptions.delete_many(q)
    await db.push_reminders.delete_many({'user_id': user['id'], 'sent': False})
    return {'ok': True}


@api_router.post('/push/test')
async def push_test(user=Depends(get_current_user)):
    sent = await send_to_user(user['id'], 'Tô de Plantão', 'Lembretes ativados neste aparelho ✅')
    return {'sent': sent}


def _send_one(sub: dict, payload: str):
    webpush(
        subscription_info=sub,
        data=payload,
        vapid_private_key=VAPID_PRIVATE_KEY,
        vapid_claims={'sub': VAPID_SUBJECT},
        ttl=3600,
    )


async def send_to_user(user_id: str, title: str, body: str) -> int:
    payload = json.dumps({'title': title, 'body': body, 'url': '/'})
    sent = 0
    async for s in db.push_subscriptions.find({'user_id': user_id}):
        try:
            await asyncio.to_thread(_send_one, s['subscription'], payload)
            sent += 1
        except WebPushException as e:
            code = getattr(e.response, 'status_code', None)
            if code in (404, 410):
                await db.push_subscriptions.delete_one({'_id': s['_id']})
            logger.warning(f'push failed ({code}): {e}')
        except Exception as e:  # noqa: BLE001
            logger.warning(f'push error: {e}')
    return sent


async def reminder_loop():
    while True:
        try:
            now = datetime.now(timezone.utc)
            async for r in db.push_reminders.find({'sent': False, 'at': {'$lte': now}}):
                await db.push_reminders.update_one({'_id': r['_id']}, {'$set': {'sent': True}})
                await send_to_user(r['user_id'], r['title'], r['body'])
            await db.push_reminders.delete_many({'sent': True})
        except Exception as e:  # noqa: BLE001
            logger.warning(f'reminder loop error: {e}')
        await asyncio.sleep(30)


# ============ Legacy export (old MongoDB data -> Supabase import) ============
WP_DEFAULTS = {
    'color': '#32827A', 'cycle_pattern': 'SD_F_SN_F_F', 'cycle_start_shift': 'SD',
    'cycle_repeat_months': None, 'sd_start': '07:00', 'sd_end': '19:00',
    'sn_start': '19:00', 'sn_end': '07:00', 'shift_day_color': '#007AFF',
    'shift_night_color': '#FF3B30', 'avulso_color': '#34C759', 'manha_color': '#FFCC00',
    'tarde_color': '#FF9500', 'is_avulso_only': False, 'vacations': [],
}


@api_router.get('/legacy/export')
async def legacy_export(user=Depends(get_current_user)):
    old = await db.users.find_one(
        {'email': user['email'], 'deleted_at': {'$exists': False}}, {'_id': 0, 'id': 1}
    )
    if not old:
        return {'found': False, 'workplaces': [], 'shift_overrides': [], 'holidays': [], 'extra_events': []}
    uid = old['id']
    proj = {'_id': 0, 'user_id': 0}
    wps = await db.workplaces.find({'user_id': uid}, proj).to_list(500)
    wps = [{**WP_DEFAULTS, **{k: v for k, v in w.items() if v is not None or k == 'cycle_repeat_months'}} for w in wps]
    return {
        'found': True,
        'workplaces': wps,
        'shift_overrides': await db.shift_overrides.find({'user_id': uid}, proj).to_list(5000),
        'holidays': await db.holidays.find({'user_id': uid}, proj).to_list(500),
        'extra_events': await db.extra_events.find({'user_id': uid}, proj).to_list(5000),
    }


@api_router.get('/')
async def root():
    return {'app': 'Tô de Plantão API', 'ok': True}


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=False, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def on_startup():
    try:
        await db.push_subscriptions.create_index([('user_id', 1), ('endpoint', 1)], unique=True)
        await db.push_reminders.create_index([('sent', 1), ('at', 1)])
    except Exception as e:  # noqa: BLE001
        logger.warning(f'index warn: {e}')
    app.state.reminder_task = asyncio.create_task(reminder_loop())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
