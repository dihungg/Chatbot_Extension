import { HumanMessage, SystemMessage } from '@langchain/core/messages';
// Import template mà bạn vừa định nghĩa
import { strategistSystemPromptTemplate } from './templates/strategist';

/**
 * Hàm dựng danh sách tin nhắn cho Strategist Agent (Nhà chiến lược)
 * @param canonicalDescription - Mô tả chuẩn hóa từ Refiner Agent (Ví dụ: "Laptop Gaming, RAM 16GB, Giá 25tr...")
 * @returns Mảng messages chuẩn để gửi cho LLM
 */
export async function composeStrategistPrompt(canonicalDescription: string) {
  // 1. System Message: Chứa luật chơi, kiến thức 3 trang web và định dạng JSON bắt buộc
  const systemMessage = new SystemMessage(strategistSystemPromptTemplate);

  // 2. Human Message: Đưa cái "Canonical Description" vào để AI lập kế hoạch
  const content = `
NHIỆM VỤ: LẬP KẾ HOẠCH ĐIỀU HƯỚNG (NAVIGATION PLAN)

Dưới đây là mô tả sản phẩm đã được chuẩn hóa (Canonical Description). 
Hãy dựa vào đó để tạo ra chiến lược tìm kiếm trên 3 trang web mục tiêu.

=== CANONICAL DESCRIPTION (INPUT) ===
${canonicalDescription}

--------------------------------------------------
YÊU CẦU BẮT BUỘC:
1. Trả về kết quả là một JSON Array hợp lệ.
2. Phải bao gồm kế hoạch cho các trang web phù hợp (ưu tiên CellphoneS, FPT Shop, Shopee).
3. Tuân thủ nghiêm ngặt Entry Strategy và Filter Strategy đã định nghĩa trong System Prompt.
`;

  const humanMessage = new HumanMessage(content);

  // Trả về cặp tin nhắn để gửi cho Planner/LLM
  return [systemMessage, humanMessage];
}
