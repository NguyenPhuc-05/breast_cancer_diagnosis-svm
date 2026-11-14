# Breast Cancer SVM — Dự án 2

Ứng dụng minh hoạ dự đoán ung thư vú bằng SVM, được xây lại từ kiến trúc Dự án 1 nhưng tách hoàn toàn thành frontend, API mô hình, dịch vụ dữ liệu và dịch vụ định danh dùng chung.

> **Cảnh báo:** Đây là sản phẩm học tập, không phải thiết bị y tế và không cung cấp chẩn đoán. Không sử dụng kết quả để bắt đầu, trì hoãn hoặc thay đổi điều trị.

## Kiến trúc

```text
Trình duyệt (bc-svm-frontend)
   ├── đăng ký/đăng nhập ───────► Identity Service dùng chung
   │                                └── JWT HS256, aud=project-two-api
   └── dự đoán/lịch sử ─────────► bc-svm-api
                                    ├── xác minh JWT tại chỗ
                                    ├── Pipeline StandardScaler + SVC RBF
                                    └── Bearer BC_DATA_TOKEN ─► bc-svm-data
                                                                └── SQLite / PostgreSQL
```

- `bc-svm-frontend`: HTML/CSS/JavaScript tĩnh, giao diện tiếng Việt; không chứa secret.
- `bc-svm-api`: FastAPI nạp artifact, xác minh JWT, áp ngưỡng đã khoá và điều phối lịch sử.
- `bc-svm-data`: FastAPI + SQLAlchemy, chỉ nhận credential nội bộ `BC_DATA_TOKEN`.
- Identity Service: kho riêng dùng chung, không nằm trong và không được sửa bởi dự án này.
- API tiếp tục trả dự đoán nếu data service đang ngủ hoặc tạm thời không ghi được lịch sử.

## Cấu trúc kho

```text
.
├── .github/workflows/ci.yml
├── Du_an_2_Breast_Cancer
│   ├── backend
│   │   ├── app/{main.py,history.py}
│   │   ├── artifacts/{breast_cancer_svm.joblib,metadata.json}
│   │   ├── scripts/train.py
│   │   └── tests
│   ├── database
│   │   ├── {db.py,models.py,service.py}
│   │   └── tests
│   └── frontend
│       ├── {index.html,style.css,script.js}
│       └── {build-config.mjs,deployment-config.js}
├── shared/auth.py
├── docs/da2-requirements.txt
├── render.yaml
└── DATABASE.md
```

## Quy trình học máy

Dataset là Wisconsin Diagnostic Breast Cancer tích hợp trong scikit-learn, gồm 569 dòng và 30 đặc trưng. Lớp `0` là `malignant`, lớp `1` là `benign`.

1. Chia train/test 80/20 có phân tầng, `random_state=42`.
2. Pipeline: `StandardScaler` → `SVC(kernel="rbf", probability=True, class_weight="balanced")`.
3. `GridSearchCV` 5-fold phân tầng, scoring `recall_macro`, với `C=[0.1,1,10,100]` và `gamma=["scale",0.001,0.01,0.1]`.
4. Chỉ dùng xác suất out-of-fold của tập train để chọn ngưỡng đạt sensitivity ác tính tối thiểu 0.98 và có specificity tốt nhất.
5. Khoá mô hình và ngưỡng, sau đó đánh giá đúng một lần trên test.

Kết quả thật của artifact hiện tại (`model_version=2.0.0`, scikit-learn 1.9.1):

| Chỉ số | Train | OOF train | Test |
|---|---:|---:|---:|
| Accuracy | 0.9846 | 0.9714 | 0.9474 |
| Sensitivity ác tính | 0.9824 | 0.9824 | 0.9762 |
| Specificity lành tính | 0.9860 | 0.9649 | 0.9306 |
| Precision ác tính | 0.9766 | 0.9435 | 0.8913 |
| F1 ác tính | 0.9795 | 0.9625 | 0.9318 |
| ROC-AUC | 0.9983 | 0.9958 | 0.9967 |
| PR-AUC | 0.9978 | 0.9948 | 0.9952 |

- Best params: `C=10`, `gamma=0.01`.
- Ngưỡng đã khoá: `0.301136760495242`.
- Confusion matrix test theo thứ tự `[malignant, benign]`: `[[41, 1], [5, 67]]`.

Các con số trên được lấy từ `artifacts/metadata.json`; không dùng README làm nguồn cho API.

## Biến môi trường

| Dịch vụ | Biến | Bắt buộc | Ý nghĩa |
|---|---|---:|---|
| API | `JWT_SECRET` | Có | Cùng giá trị với Identity Service, tối thiểu 32 ký tự; giá trị mặc định đã biết bị chặn. |
| API | `CLIENT_ID` | Có khi deploy | Phải là `project-two-api`. |
| API | `FRONTEND_ORIGINS` | Có khi deploy | Danh sách origin CORS phân tách bằng dấu phẩy. |
| API | `BC_DATA_URL` | Có trên Render | HTTPS origin của `bc-svm-data`. |
| API + data | `BC_DATA_TOKEN` | Có trên Render | Credential nội bộ, tối thiểu 32 ký tự, dùng cùng một env group. |
| API | `MAX_REQUEST_BYTES` | Không | Mặc định `65536`. |
| API | `RATE_LIMIT_REQUESTS` | Không | Mặc định 60 request mỗi cửa sổ/người dùng. |
| API | `RATE_LIMIT_WINDOW_SECONDS` | Không | Mặc định 60 giây. |
| Data | `DATABASE_URL` | Không | Bỏ trống để dùng SQLite; hỗ trợ URL PostgreSQL. URL khai báo sai hoặc không kết nối được sẽ làm service dừng. |
| Frontend build | `BC_API_URL` | Có khi deploy | HTTPS origin của API, không có path. |
| Frontend build | `IDP_API_URL` | Có khi deploy | HTTPS origin của Identity Service, không có path. |

Không ghi secret vào `.env`, YAML, mã nguồn hoặc commit. Trên Render, nhập `JWT_SECRET` bằng Dashboard và để `BC_DATA_TOKEN` do env group sinh.

## Chạy cục bộ trên Windows PowerShell

Yêu cầu Python 3.12 và Node.js chỉ để kiểm tra/build cấu hình frontend. Identity Service phải chạy riêng trên cổng 8001, chấp nhận client `project-two-api`, và dùng cùng `JWT_SECRET`.

```powershell
cd D:\Du_an_2_Hmnc
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r .\Du_an_2_Breast_Cancer\backend\requirements.txt
```

Tạo hai giá trị ngẫu nhiên trong phiên shell của bạn, không lưu chúng vào kho. Mở terminal 1 cho data service:

```powershell
$env:BC_DATA_TOKEN = '<random-token-at-least-32-characters>'
uvicorn database.service:app --app-dir .\Du_an_2_Breast_Cancer --host 127.0.0.1 --port 8002
```

Terminal 2 cho API (dùng đúng token ở trên và secret của IdP):

```powershell
$env:JWT_SECRET = '<same-random-secret-as-identity-service>'
$env:CLIENT_ID = 'project-two-api'
$env:FRONTEND_ORIGINS = 'http://127.0.0.1:5500'
$env:BC_DATA_URL = 'http://127.0.0.1:8002'
$env:BC_DATA_TOKEN = '<same-data-token-as-terminal-1>'
uvicorn backend.app.main:app --app-dir .\Du_an_2_Breast_Cancer --host 127.0.0.1 --port 8000
```

Terminal 3 cho frontend:

```powershell
python -m http.server 5500 --directory .\Du_an_2_Breast_Cancer\frontend
```

Mở `http://127.0.0.1:5500`. Ở chế độ local, frontend tự dùng API `:8000` và IdP `:8001`; `deployment-config.js` chỉ được ghi bởi build Render.

## API chính

| Method | Path | Quyền | Chức năng |
|---|---|---|---|
| GET | `/`, `/health`, `/metadata`, `/metrics` | Công khai | Trạng thái, contract và chỉ số test. |
| POST | `/predict` | JWT | Dự đoán từ đúng 30 trường số có tên. |
| GET | `/predictions` | JWT | Lịch sử riêng theo claim `sub`. |
| DELETE | `/predictions` | JWT | Xoá toàn bộ lịch sử riêng. |
| GET | `/predictions/export` | JWT | Xuất lịch sử `.xlsx`. |
| GET | `/admin/predictions` | Owner JWT | Xem dự đoán toàn hệ thống nhưng không trả `user_id`. |

JWT có `aud` khác `project-two-api` bị trả 401. Payload thiếu/thừa, sai kiểu, không hữu hạn hoặc ngoài khoảng dữ liệu được trả 422 cùng danh sách trường. Request log chỉ chứa metadata và request ID, không chứa payload.

## Kiểm thử và huấn luyện lại

```powershell
cd D:\Du_an_2_Hmnc\Du_an_2_Breast_Cancer\backend
python -m pytest -q
python scripts\train.py

cd ..\database
python -m pytest -q

cd ..\frontend
node --check script.js
node --check build-config.mjs
```

CI còn chạy smoke test với PostgreSQL 16 thật và quét secret/private key/provider token. Huấn luyện lại sẽ ghi đè artifact và metadata; phải review số liệu thật trước khi commit.

## Triển khai Render

`render.yaml` tạo đúng ba service miễn phí: `bc-svm-data`, `bc-svm-api`, `bc-svm-frontend`. Identity Service là dịch vụ dùng chung đã tồn tại.

Checklist thủ công:

- [ ] Push nhánh đã review lên GitHub rồi tạo **Render Blueprint** từ `render.yaml`.
- [ ] Khi Render yêu cầu, nhập `JWT_SECRET` cho `bc-svm-api` bằng **đúng cùng giá trị** đang dùng ở Identity Service.
- [ ] Trong Identity Service, bảo đảm `CLIENT_IDS` có `project-two-api`.
- [ ] Thêm origin frontend mới `https://bc-svm-frontend.onrender.com` vào `FRONTEND_ORIGINS` của Identity Service rồi redeploy IdP.
- [ ] Xác nhận env group `bc-storage` được gắn cho cả API và data service; không sao chép token vào mã nguồn.
- [ ] Nếu tên service bị trùng và Render đổi URL, cập nhật đồng bộ `FRONTEND_ORIGINS`, `BC_DATA_URL` và `BC_API_URL`.
- [ ] Mở `/health` của data và API, sau đó kiểm tra đăng ký, đăng nhập, hai mẫu hồi quy, lịch sử, xoá và xuất Excel.
- [ ] Muốn dữ liệu bền vững, tạo Render Postgres và đặt internal URL vào `DATABASE_URL` của `bc-svm-data`; redeploy và kiểm tra `/health`.

## Giới hạn trung thực

- Chỉ dùng cho giáo dục; không có chứng nhận y tế.
- Không có external validation, đánh giá theo dân số/bệnh viện, theo dõi drift hay hiệu chỉnh xác suất lâm sàng.
- Dataset nhỏ, sạch và không đại diện đầy đủ cho dữ liệu vận hành thực tế.
- SQLite mặc định trên gói Render Free nằm trên filesystem tạm thời, có thể mất khi redeploy/restart; dùng PostgreSQL để lưu bền vững.
- Rate limit lưu trong bộ nhớ từng process, không phải rate limit phân tán.
- Batch CSV là phần mở rộng tuỳ chọn của đề và chưa được triển khai.
- Admin xem dữ liệu tổng hợp nhưng API cố ý không trả định danh người dùng trong bản ghi dự đoán.

Chi tiết lưu trữ và chuyển sang PostgreSQL nằm trong [DATABASE.md](DATABASE.md).
