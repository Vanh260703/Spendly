import { api, ApiError } from '@/lib/api/client';

interface ChuKyUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

export interface AnhDaUpload {
  url: string;
  publicId: string;
}

/** Cạnh dài tối đa sau khi nén. QR 800px quét vẫn tốt kể cả khi in ra giấy. */
const CANH_TOI_DA = 800;

/** Chặn sớm ở FE cho ảnh gốc — thông báo rõ ràng hơn là để Cloudinary trả lỗi khó hiểu */
const KICH_THUOC_TOI_DA = 10 * 1024 * 1024;

/**
 * Thu nhỏ ảnh trước khi upload.
 *
 * Ảnh chụp màn hình điện thoại thường 2–4MB cho một mã QR mà phần lớn là nền trắng. Không
 * nén thì mỗi lần mở danh bạ là tải về vài MB ảnh, và quota băng thông Cloudinary (thứ hết
 * trước tiên, không phải dung lượng lưu trữ) bốc hơi rất nhanh.
 *
 * Xuất ra JPEG chất lượng 0.85 — QR là ảnh tương phản cao nên nén mất mát ở mức này không
 * ảnh hưởng gì tới khả năng quét, mà nhẹ hơn PNG nhiều lần.
 */
async function nenAnh(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const tyLe = Math.min(1, CANH_TOI_DA / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * tyLe);
  const h = Math.round(bitmap.height * tyLe);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không dựng được canvas để nén ảnh');

  /*
    Tô nền trắng trước khi vẽ: ảnh QR dạng PNG hay có nền TRONG SUỐT, mà JPEG không có kênh
    alpha nên vùng trong suốt sẽ thành ĐEN. QR đen trên nền đen thì không máy nào quét ra.
  */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob) throw new Error('Không nén được ảnh');
  return blob;
}

/**
 * Upload ảnh QR: xin chữ ký từ BE → nén → đẩy THẲNG lên Cloudinary.
 *
 * File không đi qua BE. FE build tĩnh nên không có route handler để proxy, và đẩy qua BE
 * cũng chỉ tốn gấp đôi băng thông cho cùng một tấm ảnh. BE chỉ giữ `API_SECRET` và ký.
 */
export async function uploadAnhQr(file: File): Promise<AnhDaUpload> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Vui lòng chọn một file ảnh');
  }
  if (file.size > KICH_THUOC_TOI_DA) {
    throw new Error('Ảnh quá lớn (tối đa 10MB)');
  }

  // 503 ở đây nghĩa là chưa cấu hình Cloudinary trong BE/.env — thông điệp của BE đã nói rõ
  const chuKy = await api.get<ChuKyUpload>('/uploads/signature');

  const anh = await nenAnh(file);

  /*
    ⚠️ Các trường ký ở BE (`timestamp`, `folder`) phải gửi lên ĐÚNG như vậy, không thừa không
    thiếu — lệch một tham số là Cloudinary trả 401 "Invalid Signature" mà không nói lệch ở đâu.
  */
  const form = new FormData();
  form.append('file', anh);
  form.append('api_key', chuKy.apiKey);
  form.append('timestamp', String(chuKy.timestamp));
  form.append('signature', chuKy.signature);
  form.append('folder', chuKy.folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${chuKy.cloudName}/image/upload`,
    { method: 'POST', body: form },
  );

  if (!res.ok) {
    const chiTiet = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new ApiError(
      chiTiet?.error?.message ?? 'Upload ảnh lên Cloudinary thất bại',
      res.status,
    );
  }

  const data = (await res.json()) as { secure_url: string; public_id: string };
  return { url: data.secure_url, publicId: data.public_id };
}
