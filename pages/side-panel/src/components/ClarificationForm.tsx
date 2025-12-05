import { useEffect, useState } from 'react';
import type { RequirementClarificationPayload } from '../types/requirement';

interface ClarificationFormProps {
  request: RequirementClarificationPayload;
  onSubmit: (answers: Record<string, string>) => Promise<void>;
  isSubmitting: boolean;
  isDarkMode: boolean;
  initialAnswers?: Record<string, string>;
  onClearSavedAnswers?: () => void;
  hasSavedAnswers?: boolean;
}

const ClarificationForm = ({
  request,
  onSubmit,
  isSubmitting,
  isDarkMode,
  initialAnswers,
  onClearSavedAnswers,
  hasSavedAnswers = false,
}: ClarificationFormProps) => {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers ?? {});

  useEffect(() => {
    const initial: Record<string, string> = {};
    request.questions.forEach(question => {
      if (initialAnswers && initialAnswers[question.id]) {
        initial[question.id] = initialAnswers[question.id];
      } else {
        initial[question.id] = '';
      }
    });
    setAnswers(initial);
  }, [request, initialAnswers]);

  const handleChange = (questionId: string, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit(answers);
  };

  const bgClass = isDarkMode
    ? 'bg-slate-900/80 border-sky-800 text-sky-100'
    : 'bg-white/90 border-sky-200 text-slate-800';
  const labelClass = isDarkMode ? 'text-sky-200' : 'text-slate-700';
  const inputClass = isDarkMode
    ? 'bg-slate-900/70 border-sky-700 text-sky-100 placeholder-sky-400'
    : 'bg-white border-sky-200 text-slate-800 placeholder-slate-400';

  return (
    <div className={`m-2 rounded-xl border p-4 shadow-lg ${bgClass}`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Làm rõ nhu cầu mua sắm</h3>
        <p className="text-sm opacity-80">
          Trả lời nhanh các câu hỏi dưới đây để trợ lý hiểu đúng yêu cầu trước khi bắt đầu lập kế hoạch.
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        {request.questions.map(question => (
          <div key={question.id} className="flex flex-col gap-2">
            <label htmlFor={question.id} className={`text-sm font-medium ${labelClass}`}>
              {question.text}{' '}
              {question.isCore && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs">Bắt buộc</span>}
            </label>
            <textarea
              id={question.id}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 ${inputClass}`}
              rows={2}
              value={answers[question.id] ?? ''}
              placeholder="Nhập câu trả lời của bạn..."
              onChange={event => handleChange(question.id, event.target.value)}
              disabled={isSubmitting}
              required={question.isCore}
            />
          </div>
        ))}
        <div className="flex items-center justify-between">
          {hasSavedAnswers && onClearSavedAnswers && (
            <button
              type="button"
              onClick={onClearSavedAnswers}
              className={`text-xs underline ${isDarkMode ? 'text-sky-300 hover:text-sky-200' : 'text-sky-700 hover:text-sky-600'}`}>
              Quên câu trả lời đã lưu
            </button>
          )}
          <button
            type="submit"
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              isDarkMode ? 'bg-sky-600 text-white hover:bg-sky-500' : 'bg-sky-500 text-white hover:bg-sky-600'
            } disabled:cursor-not-allowed disabled:opacity-60 ml-auto`}
            disabled={isSubmitting}>
            {isSubmitting ? 'Đang gửi...' : 'Gửi câu trả lời'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ClarificationForm;
