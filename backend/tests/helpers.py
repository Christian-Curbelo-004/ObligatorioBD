import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import jwt
from datetime import datetime, timezone, timedelta
import config


def make_token(rol="administrador"):
    return jwt.encode(
        {
            "correo": "test@test.com",
            "rol": rol,
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        config.JWT_SECRET,
        algorithm="HS256",
    )


def auth_headers(rol="administrador"):
    return {
        "Authorization": f"Bearer {make_token(rol)}",
        "Content-Type": "application/json",
    }
