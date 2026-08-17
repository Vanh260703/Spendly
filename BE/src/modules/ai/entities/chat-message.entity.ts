import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum ChatRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

@Entity('chat_messages')
// Lấy đúng thứ tự tin nhắn của một cuộc trò chuyện
@Index(['userId', 'conversationId', 'createdAt'])
export class ChatMessage extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * Gom nhiều tin nhắn thành MỘT CUỘC TRÒ CHUYỆN.
   * Cần vì mỗi lần hỏi tiếp phải gửi lại các tin trước làm ngữ cảnh, AI mới hiểu được
   * câu kiểu "thế còn tháng trước?".
   */
  @Column('uuid')
  conversationId: string;

  /** Ai nói câu này — `user` là người dùng, `assistant` là AI */
  @Column({ type: 'enum', enum: ChatRole })
  role: ChatRole;

  @Column('text')
  content: string;
}
