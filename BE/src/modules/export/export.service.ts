import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DateRange } from '../../common/utils/period';
import { Transaction } from '../transactions/entities/transaction.entity';

@Injectable()
export class ExportService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  /**
   * Xuất giao dịch ra CSV.
   *
   * Dùng CSV thay vì .xlsx để không phải kéo thêm thư viện nặng — Excel mở CSV bình thường,
   * miễn là có BOM UTF-8 (xem `withBom`). Không có BOM thì Excel trên Windows đọc tiếng Việt
   * thành ký tự rác.
   */
  async toCsv(userId: string, range?: Partial<DateRange>): Promise<string> {
    const qb = this.txRepo
      .createQueryBuilder('t')
      .innerJoin('t.category', 'c')
      .select([
        't.date AS date',
        't.type AS type',
        't.amount AS amount',
        'c.name AS category',
        'c.kind AS kind',
        't.note AS note',
        't.tags AS tags',
      ])
      .where('t.userId = :userId', { userId });

    if (range?.start) qb.andWhere('t.date >= :start', { start: range.start });
    if (range?.end) qb.andWhere('t.date <= :end', { end: range.end });

    const rows = await qb.orderBy('t.date', 'DESC').getRawMany<{
      date: Date;
      type: string;
      amount: string;
      category: string;
      kind: string;
      note: string | null;
      tags: string[] | null;
    }>();

    const header = ['Ngày', 'Loại', 'Số tiền', 'Danh mục', 'Phân loại', 'Ghi chú', 'Tag'];

    const body = rows.map((r) =>
      [
        r.date.toISOString().slice(0, 10),
        r.type === 'income' ? 'Thu' : 'Chi',
        // SUM/raw query trả bigint dạng chuỗi — ở đây xuất thẳng nên vẫn đúng
        r.amount,
        r.category,
        { need: 'Cần thiết', want: 'Mong muốn', saving: 'Tiết kiệm' }[r.kind] ?? r.kind,
        r.note ?? '',
        (r.tags ?? []).join('; '),
      ].map(escapeCsv),
    );

    return [header.map(escapeCsv), ...body].map((cols) => cols.join(',')).join('\r\n');
  }

  /** Excel trên Windows cần BOM mới nhận UTF-8, không có thì tiếng Việt thành ký tự rác */
  withBom(csv: string): Buffer {
    return Buffer.concat([Buffer.from('﻿', 'utf8'), Buffer.from(csv, 'utf8')]);
  }
}

/**
 * Bọc ô CSV. Bắt buộc với dữ liệu người dùng nhập: ghi chú có dấu phẩy, xuống dòng, hoặc
 * dấu nháy kép sẽ làm vỡ cấu trúc file nếu không escape.
 */
function escapeCsv(value: string): string {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
