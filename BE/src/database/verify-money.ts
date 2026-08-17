/**
 * Script kiểm chứng MoneyTransformer round-trip qua Postgres thật.
 * Chạy: npx ts-node src/database/verify-money.ts
 *
 * Kiểm tra điều dễ sai nhất của cả dự án: cột `bigint` phải quay về JS dưới dạng `number`,
 * không phải `string`. Nếu ra string thì mọi phép cộng tiền sau này đều là nối chuỗi.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source';
import { User } from '../modules/users/entities/user.entity';
import {
  Category,
  CategoryKind,
  CategoryType,
} from '../modules/categories/entities/category.entity';
import {
  Transaction,
  TxType,
} from '../modules/transactions/entities/transaction.entity';
import { Wallet } from '../modules/wallets/entities/wallet.entity';

async function main() {
  const ds = await new DataSource(dataSourceOptions).initialize();
  let ok = true;
  const check = (nhan: string, dieuKien: boolean, thucTe: unknown) => {
    console.log(`${dieuKien ? '✅' : '❌'} ${nhan} → ${JSON.stringify(thucTe)}`);
    if (!dieuKien) ok = false;
  };

  try {
    const user = await ds.getRepository(User).save({
      email: `verify-${Date.now()}@spendly.local`,
      passwordHash: 'khong-phai-hash-that',
      name: 'Kiểm thử',
      monthlyIncome: 20_000_000,
    });

    const wallet = await ds.getRepository(Wallet).save({
      userId: user.id,
      name: 'Ví chính',
      initialBalance: 12_000_000,
      startedAt: new Date(),
    });

    const cat = await ds.getRepository(Category).save({
      userId: user.id,
      name: 'Cà phê',
      type: CategoryType.EXPENSE,
      kind: CategoryKind.WANT,
      icon: 'coffee',
      color: '#a16207',
    });

    const txRepo = ds.getRepository(Transaction);
    await txRepo.save([
      { userId: user.id, walletId: wallet.id, categoryId: cat.id, type: TxType.EXPENSE, amount: 50_000, date: new Date(), tags: [] },
      { userId: user.id, walletId: wallet.id, categoryId: cat.id, type: TxType.EXPENSE, amount: 65_000, date: new Date(), tags: ['sang'] },
      { userId: user.id, walletId: wallet.id, categoryId: cat.id, type: TxType.INCOME, amount: 20_000_000, date: new Date(), tags: [] },
    ]);

    // 1. Đọc lại một bản ghi — kiểu phải là number
    const tx = await txRepo.findOneByOrFail({ userId: user.id, amount: 65_000 });
    check('amount là number (không phải string)', typeof tx.amount === 'number', typeof tx.amount);
    check('amount đúng giá trị', tx.amount === 65_000, tx.amount);

    // 2. Phép cộng phải là cộng số, không phải nối chuỗi
    check('amount + 5000 = 70000 (không nối chuỗi)', tx.amount + 5_000 === 70_000, tx.amount + 5_000);

    // 3. initialBalance trên Wallet cũng phải qua transformer
    const w = await ds.getRepository(Wallet).findOneByOrFail({ id: wallet.id });
    check('Wallet.initialBalance là number', typeof w.initialBalance === 'number', typeof w.initialBalance);

    // 4. Aggregate SUM — Postgres trả bigint dạng string, phải Number() thủ công vì
    //    transformer KHÔNG áp dụng cho raw query. Đây là bẫy khi viết module stats.
    const raw = await txRepo
      .createQueryBuilder('t')
      .select('t.type', 'type')
      .addSelect('SUM(t.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('t.userId = :uid', { uid: user.id })
      .groupBy('t.type')
      .getRawMany<{ type: string; total: string; count: string }>();

    const chi = raw.find((r) => r.type === TxType.EXPENSE)!;
    console.log(`\nℹ️  SUM qua QueryBuilder trả về: ${JSON.stringify(chi)}`);
    check('SUM(chi) = 115000 sau khi Number()', Number(chi.total) === 115_000, Number(chi.total));
    check('COUNT(chi) = 2', Number(chi.count) === 2, Number(chi.count));

    // 5. Công thức số tiền hiện có (SPEC §3)
    const thu = Number(raw.find((r) => r.type === TxType.INCOME)?.total ?? 0);
    const soTienHienCo = w.initialBalance + thu - Number(chi.total);
    check(
      'Số tiền hiện có = 12tr + 20tr − 115k = 31.885.000',
      soTienHienCo === 31_885_000,
      soTienHienCo,
    );

    // Dọn dẹp — xóa user là cascade hết
    await ds.getRepository(User).delete({ id: user.id });
    console.log('\n🧹 Đã xóa dữ liệu kiểm thử');
  } finally {
    await ds.destroy();
  }

  console.log(ok ? '\n✅ TẤT CẢ ĐỀU ĐÚNG' : '\n❌ CÓ LỖI');
  process.exit(ok ? 0 : 1);
}

void main();
