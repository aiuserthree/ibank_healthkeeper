import uvicorn

from app.config import get_settings
from app.main import create_app

app = create_app()

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=settings.api_port,
        reload=True,
    )
