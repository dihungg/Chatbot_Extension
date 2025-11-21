import { HumanMessage, SystemMessage } from "@langchain/core/messages";
// Import template Canonical Description cho Refiner Agent
import { refinerSystemPromptTemplate } from './templates/refiner';

/**
 * Hàm dựng danh sách tin nhắn cho Refiner Agent
 * @param rawTask - Yêu cầu thô nhập từ thanh chat (VD: "Mua máy cho sinh viên...")
 * @param userProfile - Thông tin người dùng (VD: "Sinh viên, thích nhẹ...")
 * @returns Mảng messages chuẩn để gửi cho LLM
 */
export async function composeRefinerPrompt(rawTask: string, userProfile: string = "") {
  
  // 1. System Message: Chứa luật và định dạng đầu ra (Canonical Description)
  const systemMessage = new SystemMessage(refinerSystemPromptTemplate);

  // 2. Human Message: Chứa dữ liệu thực tế cần xử lý
  // Chúng ta format rõ ràng để LLM phân biệt đâu là Profile, đâu là Yêu cầu
  const content = `
DƯỚI ĐÂY LÀ DỮ LIỆU ĐẦU VÀO CẦN BẠN CHUẨN HÓA:

=== THÔNG TIN NGƯỜI DÙNG (USER PROFILE) ===
${userProfile ? userProfile : "Không có thông tin hồ sơ cụ thể (Coi như người dùng phổ thông)."}

=== YÊU CẦU GỐC (RAW USER PROMPT) ===
"${rawTask}"

--------------------------------------------------
Hãy phân tích các thông tin trên và trả về "Canonical Description" theo đúng cấu trúc mẫu đã quy định trong System Prompt.
`;

  const humanMessage = new HumanMessage(content);

  return [systemMessage, humanMessage];
}