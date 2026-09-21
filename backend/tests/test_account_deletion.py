"""
Tests for the DELETE /api/auth/me account deletion endpoint on EscalaFácil.

Flow verified:
  1. Register → create workplace/override/holiday/event → 200/201.
  2. DELETE /api/auth/me → 204.
  3. Same token afterwards → 401 for /auth/me and /workplaces.
  4. Owned data (workplaces/overrides/holidays/events) gone; login with same
     email fails (password_hash cleared) → 401.
  5. Registering fresh account with the same email succeeds (201).
  6. DELETE /api/auth/me without token → 401.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://nurse-scheduler-15.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


def _unique_email() -> str:
    # backend normalises to lowercase, keep the payload lowercase to match on read-back
    return f"test_delme_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def test_state():
    """Shared state across test steps."""
    return {
        "email": _unique_email(),
        "password": "delme123456",
        "name": "Delete Me User",
        "token": None,
        "user_id": None,
        "workplace_id": None,
        "holiday_id": None,
        "event_id": None,
        "override_date": "2026-02-15",
    }


class TestAccountDeletionFlow:

    # ---------- Step 1: seed a user with data ----------
    def test_01_register_user(self, session, test_state):
        r = session.post(f"{API}/auth/register", json={
            "name": test_state["name"],
            "email": test_state["email"],
            "password": test_state["password"],
        })
        assert r.status_code == 201, r.text
        data = r.json()
        assert "access_token" in data
        test_state["token"] = data["access_token"]

        me = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {test_state['token']}"})
        assert me.status_code == 200, me.text
        me_json = me.json()
        assert me_json["email"] == test_state["email"]
        test_state["user_id"] = me_json["id"]

    def test_02_create_workplace(self, session, test_state):
        headers = {"Authorization": f"Bearer {test_state['token']}"}
        payload = {
            "name": "TEST_Hospital",
            "cycle_pattern": "SD_F_SN_F_F",
            "cycle_start_date": "2026-01-01",
            "cycle_start_shift": "SD",
        }
        r = session.post(f"{API}/workplaces", json=payload, headers=headers)
        assert r.status_code == 201, r.text
        wp = r.json()
        assert wp["name"] == "TEST_Hospital"
        assert wp["user_id"] == test_state["user_id"]
        test_state["workplace_id"] = wp["id"]

    def test_03_create_shift_override(self, session, test_state):
        headers = {"Authorization": f"Bearer {test_state['token']}"}
        wid = test_state["workplace_id"]
        date = test_state["override_date"]
        payload = {"shift_type": "SD", "note": "TEST override"}
        r = session.put(f"{API}/shifts/{wid}/{date}", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["shift_type"] == "SD"
        assert body["date"] == date

    def test_04_create_holiday(self, session, test_state):
        headers = {"Authorization": f"Bearer {test_state['token']}"}
        r = session.post(f"{API}/holidays", json={"date": "2026-04-21", "name": "TEST_Holiday"}, headers=headers)
        assert r.status_code == 201, r.text
        h = r.json()
        assert h["name"] == "TEST_Holiday"
        test_state["holiday_id"] = h["id"]

    def test_05_create_extra_event(self, session, test_state):
        headers = {"Authorization": f"Bearer {test_state['token']}"}
        r = session.post(f"{API}/events", json={"date": "2026-03-10", "label": "TEST_Event"}, headers=headers)
        assert r.status_code == 201, r.text
        e = r.json()
        assert e["label"] == "TEST_Event"
        test_state["event_id"] = e["id"]

    def test_06_verify_seed_visible_before_delete(self, session, test_state):
        headers = {"Authorization": f"Bearer {test_state['token']}"}
        wps = session.get(f"{API}/workplaces", headers=headers)
        assert wps.status_code == 200
        assert any(w["id"] == test_state["workplace_id"] for w in wps.json())

        hols = session.get(f"{API}/holidays", headers=headers)
        assert hols.status_code == 200
        assert any(h["id"] == test_state["holiday_id"] for h in hols.json())

        evs = session.get(f"{API}/events", headers=headers)
        assert evs.status_code == 200
        assert any(e["id"] == test_state["event_id"] for e in evs.json())

        shifts = session.get(f"{API}/shifts/{test_state['workplace_id']}", headers=headers)
        assert shifts.status_code == 200
        assert any(s["date"] == test_state["override_date"] for s in shifts.json())

    # ---------- Step 2: DELETE /api/auth/me ----------
    def test_07_delete_me_returns_204(self, session, test_state):
        headers = {"Authorization": f"Bearer {test_state['token']}"}
        r = session.delete(f"{API}/auth/me", headers=headers)
        assert r.status_code == 204, r.text
        # 204 => no body
        assert r.text in ("", None)

    # ---------- Step 3: token invalidated + data gone ----------
    def test_08_me_after_delete_returns_401(self, session, test_state):
        headers = {"Authorization": f"Bearer {test_state['token']}"}
        r = session.get(f"{API}/auth/me", headers=headers)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_09_workplaces_after_delete_returns_401(self, session, test_state):
        headers = {"Authorization": f"Bearer {test_state['token']}"}
        r = session.get(f"{API}/workplaces", headers=headers)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_10_login_with_old_credentials_fails(self, session, test_state):
        r = session.post(f"{API}/auth/login", json={
            "email": test_state["email"],
            "password": test_state["password"],
        })
        # password_hash cleared -> login must fail
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    # ---------- Step 4: re-register with same email ----------
    def test_11_reregister_same_email_succeeds(self, session, test_state):
        r = session.post(f"{API}/auth/register", json={
            "name": "Reborn User",
            "email": test_state["email"],
            "password": "reborn123456",
        })
        assert r.status_code == 201, f"expected 201, got {r.status_code}: {r.text}"
        data = r.json()
        assert "access_token" in data
        new_token = data["access_token"]

        # new user must have empty workspaces/holidays/events (previous data cascaded away)
        headers = {"Authorization": f"Bearer {new_token}"}
        me = session.get(f"{API}/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["email"] == test_state["email"]
        assert me.json()["name"] == "Reborn User"

        wps = session.get(f"{API}/workplaces", headers=headers)
        assert wps.status_code == 200
        assert wps.json() == [], f"stale workplaces leaked: {wps.json()}"

        hols = session.get(f"{API}/holidays", headers=headers)
        assert hols.status_code == 200
        assert hols.json() == [], f"stale holidays leaked: {hols.json()}"

        evs = session.get(f"{API}/events", headers=headers)
        assert evs.status_code == 200
        assert evs.json() == [], f"stale events leaked: {evs.json()}"

        # Cleanup: delete this reborn account too so the email stays free.
        cleanup = session.delete(f"{API}/auth/me", headers=headers)
        assert cleanup.status_code == 204

    # ---------- Step 5: DELETE without token ----------
    def test_12_delete_without_token_returns_401(self, session):
        r = session.delete(f"{API}/auth/me")
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_13_delete_with_invalid_token_returns_401(self, session):
        r = session.delete(f"{API}/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401
