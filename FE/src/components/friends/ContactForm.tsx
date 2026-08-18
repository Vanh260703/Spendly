'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { QrCode, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button, Field, Input } from '@/components/ui';
import { useContacts, useCreateContact } from '@/hooks/useFriends';
import type { ApiError } from '@/lib/api/client';
import { uploadAnhQr } from '@/lib/cloudinary';

/** Giới hạn khớp với `createContactSchema` ở BE — lệch thì user nhận lỗi 400 khó hiểu */
const schema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên').max(100, 'Tên tối đa 100 ký tự'),
  phone: z.string().trim().max(20, 'Số điện thoại tối đa 20 ký tự').optional(),
  note: z.string().trim().max(255, 'Ghi chú tối đa 255 ký tự').optional(),
});
type FormData = z.infer<typeof schema>;

/**
 * Thêm người vào danh bạ — KHÔNG cần chia bill trước.
 *
 * Danh bạ là danh sách người, không phải hệ quả của một hóa đơn: người mới bắt đầu ở mức
 * 0₫ và chỉ phát sinh công nợ khi có chi chung hoặc tất toán. `Contact` không có cột
 * `balance`, con số luôn được `tinhCongNo()` tính bằng `SUM()`, nên "0₫ ban đầu" là mặc
 * định tự nhiên chứ không phải một giá trị phải khởi tạo.
 */
export function ContactForm({ onDone }: { onDone: () => void }) {
  const { data: danhBa } = useContacts();
  const tao = useCreateContact();
  const oChonFile = useRef<HTMLInputElement>(null);

  const [anhQr, setAnhQr] = useState<File | null>(null);
  const [xemTruoc, setXemTruoc] = useState<string | null>(null);
  const [dangUpload, setDangUpload] = useState(false);

  /*
    `createObjectURL` giữ tấm ảnh trong bộ nhớ cho tới khi được revoke. Không dọn thì chọn
    đi chọn lại vài ảnh là rò rỉ dần — và ảnh chụp màn hình thì không hề nhỏ.
  */
  useEffect(() => {
    if (!anhQr) {
      setXemTruoc(null);
      return;
    }
    const url = URL.createObjectURL(anhQr);
    setXemTruoc(url);
    return () => URL.revokeObjectURL(url);
  }, [anhQr]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (d: FormData) => {
    /*
      Upload ảnh TRƯỚC khi tạo bản ghi. Ngược lại — tạo người rồi mới upload — mà upload hỏng
      thì trong danh bạ đã có một người không QR, user không biết là đã lưu hay chưa và bấm
      Lưu lần nữa. Upload trước thì hỏng là chưa có gì được tạo, thử lại sạch sẽ.

      Cái giá: upload xong mà bước tạo người lỗi thì tấm ảnh thành rác trên Cloudinary. Đổi
      một tấm ảnh mồ côi lấy việc không có bản ghi nửa vời là đáng.
    */
    let qr: { url: string; publicId: string } | null = null;

    if (anhQr) {
      setDangUpload(true);
      try {
        const kq = await uploadAnhQr(anhQr);
        qr = { url: kq.url, publicId: kq.publicId };
      } catch (e) {
        const err = e as ApiError;
        toast.error(
          err.status === 503
            ? 'Chưa cấu hình Cloudinary ở máy chủ nên chưa lưu được ảnh QR'
            : (err.message ?? 'Không upload được ảnh QR'),
        );
        return;
      } finally {
        setDangUpload(false);
      }
    }

    tao.mutate(
      {
        name: d.name,
        phone: d.phone || null,
        note: d.note || null,
        qrImage: qr?.url ?? null,
        qrImagePublicId: qr?.publicId ?? null,
      },
      {
        onSuccess: (c) => {
          /*
            Tên trùng thì BE trả về CHÍNH người cũ với 200, không phải 409 — ô chọn người
            trong form chia bill dựa vào hành vi đó. Ở đây phải đối chiếu id với danh bạ
            đang có để nói đúng chuyện vừa xảy ra: báo "đã thêm" cho một người vốn đã nằm
            sẵn trong danh sách sẽ khiến user tưởng mình vừa tạo ra bản ghi thứ hai.
          */
          const daCoTruocDo = (danhBa ?? []).some((x) => x.id === c.id);
          toast.success(
            daCoTruocDo ? `${c.name} đã có sẵn trong danh bạ` : `Đã thêm ${c.name}`,
          );
          onDone();
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field label="Tên" error={errors.name?.message}>
        <Input {...register('name')} placeholder="Tuấn" autoFocus />
      </Field>

      <Field label="Số điện thoại" error={errors.phone?.message}>
        <Input {...register('phone')} type="tel" inputMode="tel" placeholder="Không bắt buộc" />
      </Field>

      <Field label="Ghi chú" error={errors.note?.message}>
        <Input {...register('note')} placeholder="Bạn cùng phòng, đồng nghiệp..." />
      </Field>

      {/* ————— Ảnh QR chuyển tiền ————— */}
      <Field
        label="Ảnh QR chuyển tiền"
        hint="Lưu sẵn để lúc trả nợ khỏi phải đi hỏi lại QR của họ"
      >
        <input
          ref={oChonFile}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setAnhQr(e.target.files?.[0] ?? null)}
        />

        {xemTruoc ? (
          <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- `output: 'export'` không tối ưu được ảnh động, mà đây là blob cục bộ */}
            <img
              src={xemTruoc}
              alt="Ảnh QR đã chọn"
              className="size-20 shrink-0 rounded-lg bg-white object-contain"
            />
            <span className="muted min-w-0 flex-1 truncate text-xs">{anhQr?.name}</span>
            <button
              type="button"
              onClick={() => {
                setAnhQr(null);
                if (oChonFile.current) oChonFile.current.value = '';
              }}
              className="muted shrink-0 p-1"
              aria-label="Bỏ ảnh QR"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => oChonFile.current?.click()}
          >
            <Upload size={16} /> Chọn ảnh QR
          </Button>
        )}
      </Field>

      <p className="muted text-xs">
        Người mới bắt đầu ở mức <strong>0₫</strong> — chưa ai nợ ai. Công nợ chỉ phát sinh khi
        bạn ghi một khoản chi chung hoặc một lần tất toán.
      </p>

      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={dangUpload || tao.isPending} className="flex-1">
          {dangUpload ? (
            <>
              <QrCode size={16} /> Đang tải ảnh QR...
            </>
          ) : (
            'Lưu'
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
