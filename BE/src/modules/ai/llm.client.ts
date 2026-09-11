import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResult {
  content: string;
  tokensUsed: number;
  model: string;
}

/**
 * Client gọi mô hình ngôn ngữ qua giao thức **OpenAI-compatible**.
 *
 * Cố ý KHÔNG gắn với một nhà cung cấp cụ thể: Gemini, Groq, OpenAI, xAI đều expose
 * cùng endpoint `POST /chat/completions`, nên đổi nhà cung cấp chỉ là sửa 3 biến môi
 * trường — không đụng vào code. Dự án đã đổi một lần (xAI → Gemini vì tài khoản xAI
 * cần credit trả phí), nên khả năng đổi tiếp là có thật.
 *
 * Tách riêng khỏi `AiService` để **logic dựng prompt test được mà không gọi mạng** —
 * test tự động mà bắn thật vào API là đốt sạch quota trong một lần chạy.
 */
@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);

  constructor(private readonly config: ConfigService) {}

  /** `false` khi chưa cấu hình key — app vẫn chạy, chỉ là tính năng AI báo chưa sẵn sàng */
  get isConfigured(): boolean {
    return Boolean(this.config.get<string>('LLM_API_KEY'));
  }

  get model(): string {
    return this.config.getOrThrow<string>('LLM_MODEL');
  }

  /** Tên nhà cung cấp, chỉ dùng cho log và thông báo lỗi */
  get provider(): string {
    return this.config.get<string>('LLM_PROVIDER') ?? 'LLM';
  }

  async chat(
    messages: ChatMessageInput[],
    opts: {
      jsonMode?: boolean;
      temperature?: number;
      /**
       * Mức "suy nghĩ" của model. Gemini mặc định nghĩ khá sâu, khiến prompt dài như
       * báo cáo kỳ vượt quá 60 giây. Với tác vụ đã có sẵn số liệu và chỉ cần diễn giải
       * thì `low` cho chất lượng tương đương mà nhanh hơn nhiều.
       */
      reasoningEffort?: 'low' | 'medium' | 'high';
      /** Mặc định 60s; báo cáo kỳ cần lâu hơn vì prompt dài */
      timeoutMs?: number;
    } = {},
  ): Promise<LlmResult> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Tính năng AI chưa được cấu hình (thiếu LLM_API_KEY trong .env)',
      );
    }

    const baseUrl = this.config.getOrThrow<string>('LLM_BASE_URL');

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.getOrThrow<string>('LLM_API_KEY')}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: opts.temperature ?? 0.3,
          ...(opts.jsonMode && { response_format: { type: 'json_object' } }),
          ...(opts.reasoningEffort && { reasoning_effort: opts.reasoningEffort }),
        }),
        // Không để request treo vô hạn làm nghẽn cả tiến trình
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
    } catch (err) {
      const quaHan = (err as Error).name === 'TimeoutError';
      this.logger.warn(`Không gọi được ${this.provider}: ${(err as Error).message}`);

      throw new ServiceUnavailableException(
        quaHan
          ? 'AI xử lý quá lâu nên đã dừng. Thử lại, hoặc chọn kỳ ngắn hơn để giảm lượng dữ liệu.'
          : 'Không kết nối được dịch vụ AI, vui lòng thử lại sau',
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`${this.provider} trả ${res.status}: ${body.slice(0, 300)}`);

      /**
       * Luôn trả 503 (không phải 4xx) để FE hiện fallback thống kê thường — lỗi ở đây
       * là lỗi của dịch vụ ngoài, không phải user thao tác sai.
       *
       * Nhưng THÔNG BÁO phải nói đúng vấn đề: "gặp sự cố" chung chung khiến user ngồi
       * chờ nó tự hết, trong khi thực tế phải đi nạp credit hoặc đổi key.
       */
      throw new ServiceUnavailableException(this.dienGiaiLoi(res.status, body));
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
      model?: string;
    };

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      tokensUsed: data.usage?.total_tokens ?? 0,
      model: data.model ?? this.model,
    };
  }

  /** Dịch mã lỗi thành câu tiếng Việt nói rõ phải làm gì tiếp theo */
  private dienGiaiLoi(status: number, body: string): string {
    switch (status) {
      case 400:
        // Gemini trả 400 khi tên model sai, khác với xAI trả 404
        return body.includes('model')
          ? `Model "${this.model}" không dùng được. Kiểm tra biến LLM_MODEL trong .env.`
          : 'Yêu cầu gửi lên dịch vụ AI không hợp lệ.';

      case 401:
        return 'LLM_API_KEY không hợp lệ hoặc đã bị thu hồi.';

      case 403:
        // Hay gặp nhất với tài khoản mới: key đúng nhưng chưa có credit/chưa bật API
        return body.includes('credit') || body.includes('licenses')
          ? `Tài khoản ${this.provider} chưa có credit. Nạp thêm rồi tính năng AI sẽ chạy lại.`
          : `Key ${this.provider} không có quyền gọi model này.`;

      case 404:
        return `Model "${this.model}" không tồn tại. Kiểm tra biến LLM_MODEL trong .env.`;

      case 429:
        return 'Đã hết lượt gọi AI của nhà cung cấp, vui lòng thử lại sau.';

      default:
        return status >= 500
          ? `Dịch vụ ${this.provider} đang gặp sự cố, thử lại sau ít phút.`
          : 'Không gọi được dịch vụ AI.';
    }
  }
}
