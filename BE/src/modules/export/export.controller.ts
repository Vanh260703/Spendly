import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ExportService } from './export.service';

const exportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
type ExportQuery = z.infer<typeof exportQuerySchema>;

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('excel')
  async excel(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(exportQuerySchema)) query: ExportQuery,
    @Res() res: Response,
  ) {
    const csv = await this.exportService.toCsv(user.id, {
      start: query.from,
      end: query.to,
    });
    const ten = `spendly-${new Date().toISOString().slice(0, 10)}.csv`;

    // Trả file thô, KHÔNG bọc envelope {success, data} như các endpoint khác
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${ten}"`,
      })
      .send(this.exportService.withBom(csv));
  }
}
