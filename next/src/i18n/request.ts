import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value || 'uk';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    onError(error) {
      if (error.code === 'MISSING_MESSAGE') {
        // Log but don't throw — prevents SSR crashes from missing translations
        console.warn(`[i18n] ${error.message}`);
      } else {
        console.error('[i18n]', error);
      }
    },
    getMessageFallback({ namespace, key }) {
      // Return the last part of the key as fallback (e.g., "chest" for "gym.muscle_groups.chest")
      return key;
    },
  };
});
