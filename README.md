# 💰 VND Currency Recognition System

Hệ thống nhận diện tiền Việt Nam sử dụng AI (YOLOv8) với giao diện web.

![Demo](https://img.shields.io/badge/Status-Ready-green) ![Python](https://img.shields.io/badge/Python-3.10+-blue) ![Docker](https://img.shields.io/badge/Docker-Ready-blue)

---

## 🎯 Tính năng

- ✅ **Nhận diện real-time** qua camera
- ✅ **Upload ảnh** để nhận diện
- ✅ **Hiển thị mệnh giá** với độ tin cậy
- ✅ **Tự động quy đổi** USD, EUR, JPY
- ✅ **Cộng dồn tổng tiền** khi xác nhận

---

## 🚀 Cách chạy

### Cách 1: Docker (Khuyến nghị)

**Yêu cầu:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
# 1. Mở terminal tại thư mục project
cd C:\Users\haida\Desktop\AI-vnd

# 2. Build và chạy
docker-compose up --build

# 3. Mở trình duyệt
http://localhost
```

**Các lệnh Docker hữu ích:**
| Lệnh | Mô tả |
|------|-------|
| `docker-compose up -d` | Chạy ngầm |
| `docker-compose down` | Dừng |
| `docker-compose logs -f` | Xem logs |

---

### Cách 2: Chạy thủ công (Development)

**Yêu cầu:** Python 3.10+

**Terminal 1 - Backend:**
```bash
cd C:\Users\haida\Desktop\AI-vnd\backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd C:\Users\haida\Desktop\AI-vnd\frontend
python -m http.server 5500
```

**Mở trình duyệt:** `http://localhost:5500`

---

## 🎮 Hướng dẫn sử dụng

### Camera Live
1. Bấm **"Bật Camera"**
2. Đưa tờ tiền vào khung hình
3. Chờ thanh stability đầy (5 lần liên tiếp)
4. Bấm **"Xác Nhận"** hoặc nhấn **Space**

### Upload Ảnh
1. Kéo thả ảnh hoặc click **"Chọn file"**
2. Xem preview ảnh đã nạp
3. Bấm **"Xác Nhận"** để nhận diện

### Phím tắt
| Phím | Chức năng |
|------|-----------|
| `Space` | Xác nhận detection |
| `Escape` | Bỏ qua / Hủy |
| `P` | Pause/Resume streaming |

---

## 📁 Cấu trúc thư mục

```
AI-vnd/
├── backend/
│   ├── main.py              # FastAPI server
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── index.html           # Giao diện chính
│   ├── app.js               # Logic JavaScript
│   └── styles.css           # CSS styles
├── best.pt                  # YOLOv8 model đã train
├── Dockerfile.backend
├── Dockerfile.frontend
├── nginx.conf
└── docker-compose.yml
```

---

## ⚙️ API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/` | Health check |
| POST | `/predict` | Nhận diện từ file upload |
| POST | `/predict/base64` | Nhận diện từ base64 image |

---

## 🔧 Troubleshooting

**❌ "Không thể kết nối Backend"**
- Kiểm tra backend đang chạy ở port 8000
- Chạy lại: `python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`

**❌ "Camera không hoạt động"**
- Cho phép trình duyệt truy cập camera
- Thử dùng HTTPS hoặc localhost

**❌ "Model not found"**
- Đảm bảo file `best.pt` nằm trong thư mục gốc

---

## 📞 Thông tin

- **Model:** YOLOv8 trained on VND banknotes
- **Backend:** FastAPI + Uvicorn
- **Frontend:** Vanilla JS + TailwindCSS
- **Exchange Rates:** exchangerate-api.com

---

Made with ❤️ for VND Recognition
