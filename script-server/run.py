import uvicorn
from app.config import HTTP_PORT

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=HTTP_PORT, reload=True)
