"""Security hardening tests for JWT signing after JWT_SECRET guard was added.

Covers:
  - HS256 signature is enforced (tampered payload → 401)
  - Wrong-secret token → 401
  - malformed token → 401
  - unsigned/alg=none token → 401
"""
import os
import base64
import json
import pytest
import requests
import jwt as pyjwt

BASE_URL = os.environ.get('EXPO_BACKEND_URL',
                          'https://nurse-scheduler-15.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

EMAIL = 'demo@escalafacil.com'
PASSWORD = 'demo123456'
NAME = 'Demo Enfermeiro'


@pytest.fixture(scope='module')
def demo_token():
    r = requests.post(f'{API}/auth/register',
                      json={'name': NAME, 'email': EMAIL, 'password': PASSWORD})
    if r.status_code == 201:
        return r.json()['access_token']
    assert r.status_code == 400, f'unexpected register: {r.status_code} {r.text}'
    r = requests.post(f'{API}/auth/login', json={'email': EMAIL, 'password': PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()['access_token']


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def _b64url_json(obj) -> str:
    return _b64url(json.dumps(obj, separators=(',', ':')).encode())


class TestJWTSignatureEnforcement:
    def test_token_is_hs256(self, demo_token):
        header = pyjwt.get_unverified_header(demo_token)
        assert header.get('alg') == 'HS256', f'alg={header.get("alg")}'

    def test_valid_token_accepted(self, demo_token):
        r = requests.get(f'{API}/auth/me',
                         headers={'Authorization': f'Bearer {demo_token}'})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body['email'] == EMAIL
        assert 'id' in body and 'name' in body

    def test_tampered_payload_rejected(self, demo_token):
        """Decode token, modify sub claim, re-encode header+payload with the ORIGINAL
        signature. Backend must reject because HS256 signature no longer matches."""
        parts = demo_token.split('.')
        assert len(parts) == 3
        header_b64, payload_b64, sig_b64 = parts
        # decode payload
        pad = '=' * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + pad))
        payload['sub'] = 'attacker-user-id'
        new_payload_b64 = _b64url_json(payload)
        tampered = f'{header_b64}.{new_payload_b64}.{sig_b64}'
        r = requests.get(f'{API}/auth/me',
                         headers={'Authorization': f'Bearer {tampered}'})
        assert r.status_code == 401, f'tampered token accepted: {r.status_code} {r.text}'

    def test_wrong_secret_rejected(self):
        """Token signed with a different (attacker-chosen) secret must be rejected."""
        forged = pyjwt.encode(
            {'sub': 'attacker', 'exp': 9999999999},
            'attacker-controlled-secret-32chars-xxx',
            algorithm='HS256',
        )
        r = requests.get(f'{API}/auth/me',
                         headers={'Authorization': f'Bearer {forged}'})
        assert r.status_code == 401

    def test_alg_none_rejected(self):
        """Classic alg=none downgrade attack must be rejected."""
        header = _b64url_json({'alg': 'none', 'typ': 'JWT'})
        payload = _b64url_json({'sub': 'attacker', 'exp': 9999999999})
        forged = f'{header}.{payload}.'
        r = requests.get(f'{API}/auth/me',
                         headers={'Authorization': f'Bearer {forged}'})
        assert r.status_code == 401

    def test_malformed_token_rejected(self):
        r = requests.get(f'{API}/auth/me',
                         headers={'Authorization': 'Bearer not.a.jwt'})
        assert r.status_code == 401

    def test_missing_bearer_prefix_rejected(self, demo_token):
        r = requests.get(f'{API}/auth/me',
                         headers={'Authorization': demo_token})
        assert r.status_code == 401

    def test_no_auth_header_rejected(self):
        r = requests.get(f'{API}/auth/me')
        assert r.status_code == 401

    def test_wrong_password_returns_401(self):
        r = requests.post(f'{API}/auth/login',
                         json={'email': EMAIL, 'password': 'definitely-wrong'})
        assert r.status_code == 401


class TestStartupGuardSource:
    """Informational: verify the guard exists in source (cannot restart in preview)."""

    def test_jwt_secret_guard_present(self):
        with open('/app/backend/server.py') as f:
            src = f.read()
        assert "os.environ.get('JWT_SECRET')" in src
        assert 'len(JWT_SECRET) < 32' in src
        assert 'RuntimeError' in src

    def test_env_secret_meets_minimum_length(self):
        # Not sensitive: just verifying deployed .env satisfies the guard.
        with open('/app/backend/.env') as f:
            for line in f:
                if line.startswith('JWT_SECRET='):
                    val = line.split('=', 1)[1].strip().strip('"').strip("'")
                    assert len(val) >= 32, f'JWT_SECRET too short: {len(val)}'
                    return
        pytest.fail('JWT_SECRET line missing from /app/backend/.env')
