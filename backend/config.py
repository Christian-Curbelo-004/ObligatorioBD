import os
from dotenv import load_dotenv

load_dotenv()

DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_PORT     = int(os.getenv("DB_PORT", 3306))
DB_USER     = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME     = os.getenv("DB_NAME", "torneo_futbol5")

JWT_SECRET  = os.getenv("JWT_SECRET", "change_this_secret")
JWT_EXP_H   = int(os.getenv("JWT_EXP_H", 8))
