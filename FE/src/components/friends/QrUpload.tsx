'use client';

import { QrCode, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { useUpdateContact } from '@/hooks/useFriends';

/** Ảnh gốc tối đa 1MB — base64 phình ~33% nên vẫn nằm dưới giới hạn 1.4MB của BE */
const TOI_DA = 1_000_000;

const LOAI_HOP_LE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/**
 * Ảnh QR chuyển khoản của một người trong danh bạ.
 *
 * Lưu thẳng vào DB dạng base64, không qua dịch vụ lưu ảnh ngoài: danh bạ chỉ vài người, và
 * ảnh nằm trong DB thì tự đi theo bản sao lưu — không có chuyện khôi phục xong ảnh mất hết.
 */
export function QrUpload({
  contactId,
  qrImage,
  ten,
}: {
  contactId: string;
  qrImage?: string | null;
  ten?: string;
}) {
  const capNhat = useUpdateContact();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dangDoc, setDangDoc] = useState(false);

  const chon = (file: File) => {
    /*
     * Chặn ở đây thay vì để BE từ chối: đọc xong một ảnh 5MB thành base64 rồi mới biết bị
     * chối là phí cả thời gian lẫn băng thông.
     *
     * ⚠️ Không nhận SVG dù nó cũng là ảnh — SVG chứa được `<script>` và trình duyệt sẽ chạy
     * khi mở ảnh trực tiếp.
     */
    if (!LOAI_HOP_LE.includes(file.type)) {
      toast.error('Chỉ nhận ảnh PNG, JPEG, WebP hoặc GIF');
      return;
    }
    if (file.size > TOI_DA) {
      toast.error(`Ảnh ${(file.size / 1_000_000).toFixed(1)}MB — hãy dùng ảnh dưới 1MB`);
      return;
    }

    setDangDoc(true);
    const reader = new FileReader();
    reader.onload = () => {
      setDangDoc(false);
      capNhat.mutate({ id: contactId, qrImage: reader.result as string });
    };
    reader.onerror = () => {
      setDangDoc(false);
      toast.error('Không đọc được ảnh');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      {/*
        Ảnh chiếm gần hết chiều rộng và nằm trên nền TRẮNG: camera đọc QR bằng tương phản,
        nền tối hay ảnh nhỏ đều làm quét lâu hơn. Đây là lúc người ta đang vội.
      */}
      {qrImage ? (
        <div className="rounded-xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI, `next/image` đã tắt tối ưu */}
          <img
            src={qrImage}
            alt={ten ? `Mã QR chuyển khoản của ${ten}` : 'Mã QR chuyển khoản'}
            className="mx-auto w-full max-w-xs"
          />
        </div>
      ) : (
        <div className="rounded-xl bg-[var(--surface-2)] px-4 py-10 text-center">
          <QrCode size={32} className="muted mx-auto mb-2" />
          <p className="muted text-sm">Chưa có mã QR</p>
          <p className="muted mt-1 text-xs">
            Tải ảnh lên để lúc trả nợ chỉ việc mở ra quét, khỏi đi tìm số tài khoản.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          loading={dangDoc || capNhat.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={16} /> {qrImage ? 'Đổi ảnh' : 'Tải ảnh lên'}
        </Button>

        {qrImage && (
          <Button
            variant="ghost"
            onClick={() => capNhat.mutate({ id: contactId, qrImage: null })}
            aria-label="Xóa mã QR"
            title="Xóa mã QR"
          >
            <Trash2 size={16} className="text-expense" />
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={LOAI_HOP_LE.join(',')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) chon(f);
          // Reset để chọn LẠI cùng một file vẫn kích hoạt onChange
          e.target.value = '';
        }}
      />
    </div>
  );
}
