import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RedisKeys, RedisService } from '../../shared/redis';
import { Transaction } from '../transactions/entities/transaction.entity';
import { DEFAULT_CATEGORIES } from './default-categories';
import {
  CreateCategoryDto,
  ListCategoryQuery,
  UpdateCategoryDto,
} from './dto/category.dto';
import { Category, CategoryType } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Seed danh mục mặc định cho user mới.
   *
   * Nhận `manager` để chạy chung transaction với việc tạo user và ví — đăng ký phải là
   * thao tác tất-cả-hoặc-không-gì. Tạo được user nhưng seed lỗi sẽ để lại tài khoản
   * không nhập liệu được, mà user cũng không đăng ký lại được vì email đã tồn tại.
   */
  async seedDefaults(userId: string, manager: EntityManager): Promise<Category[]> {
    const repo = manager.getRepository(Category);
    return repo.save(repo.create(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId }))));
  }

  /** Danh sách danh mục — luôn ẩn danh mục hệ thống (`isSystem`). */
  async findAll(userId: string, query: ListCategoryQuery = {}): Promise<Category[]> {
    return this.repo.find({
      where: {
        userId,
        isSystem: false,
        ...(query.type && { type: query.type }),
        ...(query.kind && { kind: query.kind }),
      },
      order: { type: 'ASC', name: 'ASC' },
    });
  }

  /**
   * Lấy danh mục và **kiểm tra quyền sở hữu**.
   *
   * Trả `404` chứ không `403` khi danh mục thuộc user khác — báo `403` là gián tiếp
   * xác nhận "id này có tồn tại", để lộ thông tin về dữ liệu của người khác.
   */
  async findOne(userId: string, id: string): Promise<Category> {
    const cat = await this.repo.findOneBy({ id, userId });
    if (!cat) throw new NotFoundException('Không tìm thấy danh mục');
    return cat;
  }

  async create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) {
      const parent = await this.findOne(userId, dto.parentId);
      if (parent.type !== dto.type) {
        throw new ConflictException('Danh mục con phải cùng loại thu/chi với danh mục cha');
      }
    }
    return this.repo.save(this.repo.create({ ...dto, userId }));
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    const cat = await this.findOne(userId, id);
    if (cat.isSystem) {
      throw new ConflictException('Không thể sửa danh mục hệ thống');
    }
    if (dto.parentId === id) {
      throw new ConflictException('Danh mục không thể là cha của chính nó');
    }

    await this.repo.update({ id, userId }, dto);
    // Tên/màu danh mục nằm trong payload thống kê đã cache
    await this.redis.delByPrefix(RedisKeys.statsPrefix(userId));
    return this.findOne(userId, id);
  }

  /**
   * Xóa danh mục — **giao dịch không bị xóa**, được chuyển hết về danh mục "Khác"
   * cùng loại thu/chi (SPEC §7). Mất danh mục thì chấp nhận được; mất lịch sử tiền thì không.
   *
   * FK `transactions.categoryId` đặt `onDelete: 'RESTRICT'` nên nếu quên bước chuyển,
   * chính DB sẽ chặn lại — đó là lưới an toàn cuối cùng, không phải lỗi.
   *
   * Ngân sách gắn với danh mục này bị xóa theo (FK `CASCADE`): hạn mức cho một danh mục
   * không còn tồn tại thì không còn ý nghĩa.
   */
  async remove(userId: string, id: string): Promise<{ movedTransactions: number }> {
    const cat = await this.findOne(userId, id);

    if (cat.isSystem) {
      throw new ConflictException('Không thể xóa danh mục hệ thống');
    }
    if (cat.isDefault) {
      throw new ConflictException(
        'Không thể xóa danh mục "Khác" — đây là nơi hứng giao dịch khi xóa danh mục khác',
      );
    }

    const fallback = await this.repo.findOneBy({
      userId,
      type: cat.type,
      isDefault: true,
      isSystem: false,
    });
    if (!fallback) {
      throw new ConflictException('Không tìm thấy danh mục "Khác" để chuyển giao dịch');
    }

    const moved = await this.dataSource.transaction(async (manager) => {
      const res = await manager.update(
        Transaction,
        { userId, categoryId: id },
        { categoryId: fallback.id },
      );
      // Danh mục con trỏ tới nó cũng phải gỡ liên kết, nếu không sẽ thành mồ côi
      await manager.update(Category, { userId, parentId: id }, { parentId: null });
      await manager.delete(Category, { id, userId });
      return res.affected ?? 0;
    });

    await this.redis.delByPrefix(RedisKeys.statsPrefix(userId));
    return { movedTransactions: moved };
  }
}
