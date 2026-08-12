# Wazue v2

Bản build lại theo hướng store nhiều sản phẩm: đăng ký/đăng nhập bằng username + password hash, session HttpOnly cookie, số dư, nạp tiền qua QR/SePay, lịch sử giao dịch, mua bằng số dư và catalog sản phẩm.

## Setup
1. Tạo Supabase project mới.
2. Chạy `database/schema.sql` trong SQL Editor.
3. Đẩy repo lên GitHub.
4. Import repo vào Vercel.
5. Thêm Environment Variables:
   - SUPABASE_URL
   - SUPABASE_KEY (Supabase secret key, chỉ server)
   - BANK_ID
   - BANK_ACC
   - SEPAY_WEBHOOK_SECRET (khuyến nghị; nếu bỏ trống webhook vẫn nhận để test)
   - QLING_BASE_URL
   - QLING_CTV_KEY
   - QLING_PREFIX
6. Redeploy Vercel.
7. Trong SePay đặt webhook tới `/api/webhook-sepay` và dùng HMAC-SHA256 nếu đã khai báo SEPAY_WEBHOOK_SECRET.

## Lưu ý
- Không commit secret key, Qling key hoặc SePay secret.
- Đây là bản code nền; trước khi dùng tiền thật nên test webhook, retry, fulfillment và backup database.
- Nếu bạn đã có database cũ, hãy backup trước khi chạy migration. Schema này được thiết kế sạch cho project mới.
