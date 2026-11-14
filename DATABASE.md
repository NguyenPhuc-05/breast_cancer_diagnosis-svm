# Database — Breast Cancer SVM

Dịch vụ `bc-svm-data` là biên lưu trữ độc lập. Trình duyệt không gọi trực tiếp dịch vụ này; chỉ `bc-svm-api` được phép truy cập bằng Bearer `BC_DATA_TOKEN` so sánh constant-time.

## Lược đồ

### `bc_users`

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `user_id` | String(100) | Primary key | Claim `sub` từ JWT. |
| `first_seen_at` | DateTime(timezone) | Not null | Lần đầu tài khoản tạo bản ghi. |

### `bc_predictions`

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | Integer | Primary key, index | Mã bản ghi nội bộ. |
| `user_id` | String(100) | Not null, index | Dùng để cô lập lịch sử theo tài khoản. |
| `created_at` | DateTime(timezone) | Not null | Thời điểm dự đoán UTC. |
| `model_version` | String(50) | Not null | Phiên bản artifact đã dùng. |
| `predicted_label` | String(20) | Not null | `malignant` hoặc `benign`. |
| `probability_malignant` | Float | Not null | Xác suất lớp 0. |
| `probability_benign` | Float | Not null | Xác suất lớp 1. |
| `threshold` | Float | Not null | Ngưỡng quyết định đã áp dụng. |
| `features_json` | Text | Not null | JSON 30 đặc trưng, sort key; không chứa thông tin nhận dạng. |

Không tạo foreign key sang Identity Service vì hai dịch vụ có vòng đời và database độc lập. API luôn lấy `user_id` từ JWT đã xác minh, không nhận ID người dùng từ payload trình duyệt.

## Hợp đồng dịch vụ

Tất cả endpoint trừ `/health` yêu cầu `Authorization: Bearer <BC_DATA_TOKEN>`:

- `POST /records`: đăng ký `bc_users` nếu chưa có và thêm một dự đoán.
- `GET /records?user_id=...&limit=...`: lấy lịch sử của đúng user.
- `DELETE /records?user_id=...`: xoá lịch sử của đúng user.
- `GET /admin/records?limit=...`: lấy bản ghi toàn hệ thống; response không chứa `user_id`.
- `GET /health`: chạy `SELECT 1`, vì vậy phản ánh cả khả năng kết nối database.

Xác suất phải nằm trong `[0,1]`, tổng hai lớp phải bằng 1 trong sai số `1e-6`, nhãn chỉ nhận hai giá trị hợp lệ, và `features` phải có đúng 30 số hữu hạn.

## SQLite mặc định

Khi không đặt `DATABASE_URL`, service dùng:

```text
Du_an_2_Breast_Cancer/database/bc_fallback.db
```

Đây là lựa chọn tiện cho local/demo. Trên Render Free, filesystem là tạm thời; file có thể mất khi service restart hoặc redeploy. Không coi SQLite trên Free plan là lưu trữ bền vững.

## PostgreSQL

`db.py` chuẩn hoá cả hai dạng sau sang driver psycopg2:

```text
postgres://...   -> postgresql+psycopg2://...
postgresql://... -> postgresql+psycopg2://...
```

Nếu `DATABASE_URL` được đặt nhưng URL sai hoặc database không kết nối được, service **dừng ngay**. Không fallback âm thầm về SQLite vì điều đó có thể che giấu mất dữ liệu.

### Bật PostgreSQL trên Render

1. Tạo Render Postgres cùng region với `bc-svm-data`.
2. Mở Environment của `bc-svm-data` và thêm `DATABASE_URL` bằng internal database URL.
3. Không thêm `DATABASE_URL` vào frontend hoặc API.
4. Redeploy data service và xác nhận `GET /health` trả `200`.
5. Đăng nhập qua frontend, tạo một dự đoán, restart data service và xác nhận bản ghi vẫn còn.

CI dùng PostgreSQL 16 thật để kiểm tra tạo user, ghi/đọc/xoá prediction và đọc lại trực tiếp qua một connection SQLAlchemy.

## Khởi tạo và migration

Hiện tại SQLAlchemy `Base.metadata.create_all()` tạo hai bảng nếu chưa tồn tại. Cách này phù hợp với schema đầu tiên nhưng không thay thế migration có phiên bản.

Trước mọi thay đổi schema sau này:

1. Sao lưu database.
2. Thêm Alembic và tạo migration có thể review.
3. Chạy migration trên môi trường staging trước.
4. Giữ API tương thích ngược trong thời gian rollout.
5. Chỉ deploy production sau khi kiểm tra restore.

## Bảo mật và dữ liệu

- `BC_DATA_TOKEN` phải dài ít nhất 32 ký tự, do secret manager/env group sinh và giống nhau ở API + data.
- Không log request body hoặc 30 đặc trưng.
- Không lưu tên, email, số hồ sơ, ngày sinh hoặc thông tin bệnh nhân.
- `user_id` là subject kỹ thuật của tài khoản; admin API không trả trường này.
- Không commit `.db`, dump PostgreSQL, `.env`, token hoặc backup vào Git.
- Khi sao lưu/khôi phục ngoài phạm vi bài tập, mã hoá file, giới hạn quyền và ghi lại thời hạn lưu giữ.
