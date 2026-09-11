import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum InsightKind {
  /** Báo cáo tuần */
  WEEKLY = 'weekly',
  /** Báo cáo tháng */
  MONTHLY = 'monthly',
  /** Đánh giá mức cần thiết + gợi ý cắt giảm — tính năng lõi của sản phẩm */
  NECESSITY = 'necessity',
  /** Phát hiện chi tiêu bất thường */
  ANOMALY = 'anomaly',
  /** Dự báo dòng tiền kỳ tới */
  FORECAST = 'forecast',
  /** Điểm sức khỏe tài chính */
  HEALTH_SCORE = 'health_score',
}

/** Cấu trúc `structured` — để FE render thành card thay vì một khối markdown dài */
export interface InsightStructured {
  /** Điểm sức khỏe tài chính 0–100 */
  healthScore?: number;
  /** Điểm thành phần, VD { tietKiem: 25, nganSach: 18, duPhong: 12 } */
  breakdown?: Record<string, number>;
  /** Danh sách việc nên làm */
  suggestions?: {
    categoryId?: string;
    categoryName: string;
    /** giữ nguyên / nên giảm / nên cắt */
    verdict: 'keep' | 'reduce' | 'cut';
    reason: string;
    /** Số tiền tiết kiệm được mỗi tháng nếu làm theo */
    monthlySaving?: number;
  }[];
}

@Entity('ai_insights')
/**
 * **MỘT bản ghi cho MỖI (user, loại, kỳ)** — bảng này là KHO LƯU TRỮ theo kỳ, không phải
 * nhật ký mọi lần gọi AI. Sinh lại báo cáo của một kỳ thì GHI ĐÈ bản cũ.
 *
 * ⚠️ Trước đây khóa duy nhất đặt trên `inputHash`, và đó là một lỗi thật: trong tuần đang
 * chạy, cứ mỗi lần user nhập thêm giao dịch rồi mở `/ai` là dữ liệu đổi → hash đổi → thêm
 * MỘT bản ghi nữa cho cùng tuần đó. Trang "Báo cáo chi tiêu" hiện ra 4–5 mục trùng tên một
 * tuần, và job sáng Thứ Hai thấy "đã có báo cáo rồi" nên bỏ qua — nên bản được giữ lại
 * vĩnh viễn là bản dựng từ dữ liệu DANG DỞ giữa tuần.
 */
@Unique(['userId', 'kind', 'periodStart'])
// Tra nhanh "báo cáo tháng 7 đâu rồi"
@Index(['userId', 'kind', 'periodStart'])
// Tra theo dấu vân tay dữ liệu (lớp cache bền) — KHÔNG duy nhất, xem giải thích ở trên
@Index(['userId', 'kind', 'inputHash'])
export class AiInsight extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: InsightKind })
  kind: InsightKind;

  /** Phân tích cho khoảng thời gian nào — từ ngày */
  @Column({ type: 'timestamptz' })
  periodStart: Date;

  /** — đến ngày */
  @Column({ type: 'timestamptz' })
  periodEnd: Date;

  /**
   * DẤU VÂN TAY của dữ liệu đã gửi cho AI (băm từ các con số tổng hợp).
   *
   * Trước khi gọi API: băm dữ liệu hiện tại, nếu trùng hash đã có → trả bản cũ luôn.
   * Đây là cơ chế chính giúp không đụng trần quota của bản Grok free.
   */
  @Column()
  inputHash: string;

  /** Nội dung AI trả về, định dạng markdown để FE render */
  @Column('text')
  content: string;

  /** Bản CÓ CẤU TRÚC của cùng kết quả đó, để FE vẽ biểu đồ / thanh điểm */
  @Column({ type: 'jsonb', nullable: true })
  structured?: InsightStructured | null;

  /** Tên model đã dùng — để biết kết quả cũ sinh ra từ đâu khi đổi model */
  @Column()
  model: string;

  /** Số token đã tiêu — theo dõi mức dùng, biết khi nào sắp cạn quota free */
  @Column({ type: 'int', default: 0 })
  tokensUsed: number;
}
