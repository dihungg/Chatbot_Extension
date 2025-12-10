import { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { t } from '@extension/i18n';
import { GeneralSettings } from './GeneralSettings';
import { FirewallSettings } from './FirewallSettings';
import { AnalyticsSettings } from './AnalyticsSettings';

interface AdvancedSettingsProps {
  isDarkMode: boolean;
}

export const AdvancedSettings = ({ isDarkMode }: AdvancedSettingsProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="space-y-4">
      {/* Advanced Settings Toggle */}
      <div
        className={`rounded-lg border ${isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-blue-100 bg-white/50'} p-6 text-left shadow-sm`}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex w-full items-center justify-between rounded-lg px-4 py-3 transition-colors ${
            isDarkMode ? 'hover:bg-slate-700/50' : 'hover:bg-blue-50'
          }`}>
          <div className="flex items-center space-x-3">
            <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              {t('options_tabs_advanced')}
            </h2>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('options_advanced_description')}
            </p>
          </div>
          <FiChevronDown
            className={`size-5 transition-transform ${isExpanded ? 'rotate-180' : ''} ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}
          />
        </button>
      </div>

      {/* Advanced Settings Content */}
      {isExpanded && (
        <div className="space-y-6 border-l-2 border-blue-400/30 pl-4">
          <GeneralSettings isDarkMode={isDarkMode} />
          <FirewallSettings isDarkMode={isDarkMode} />
          <AnalyticsSettings isDarkMode={isDarkMode} />
        </div>
      )}
    </section>
  );
};
