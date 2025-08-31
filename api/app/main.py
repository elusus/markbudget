from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import Settings
from .routers import budgets, categories, accounts, transactions, payees

settings = Settings()

app = FastAPI(title=settings.app_name)

# CORS: allow web origin for dev
allowed_origins = {str(settings.app_url), "http://localhost:3000", "http://127.0.0.1:3000"}
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": settings.app_name,
        "env": settings.app_env,
    }

# Routers
app.include_router(budgets.router)
app.include_router(categories.router)
app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(payees.router)
