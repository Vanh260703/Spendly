/**
 * `src/shared/` — các module HẠ TẦNG dùng chung, có provider và vòng đời (kết nối, queue,
 * client bên ngoài). Phân biệt với `src/common/` là nơi chứa helper thuần không trạng thái
 * (transformer, decorator, filter, pipe).
 *
 * Quy tắc: `shared/` được phép phụ thuộc `common/`, **không bao giờ ngược lại**,
 * và cả hai đều không được import từ `modules/`.
 */
export * from './redis';
