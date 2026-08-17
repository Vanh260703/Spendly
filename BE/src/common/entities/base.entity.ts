import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Lớp cha chung cho mọi entity trong dự án.
 *
 * ⚠️ KHÔNG phải `BaseEntity` của TypeORM (lớp ActiveRecord với `.save()`, `.find()`).
 * Dự án dùng Repository pattern — luôn import từ file này, không import từ 'typeorm'.
 */
export abstract class BaseEntity {
  /** Khóa chính dạng UUID, VD "a3f5c1e2-..." */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Thời điểm tạo bản ghi, TypeORM tự set */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** Thời điểm sửa lần cuối, TypeORM tự cập nhật */
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
