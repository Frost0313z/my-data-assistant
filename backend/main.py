from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.routers import chat, conversations, data

app = FastAPI(title="나만의 AI 비서 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router)
app.include_router(conversations.router)
app.include_router(chat.router)


@app.get("/")
def health():
    return {"status": "ok"}
