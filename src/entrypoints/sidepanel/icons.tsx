// Stroke icons, drawn in the text color.

import type { ReactNode } from 'react';

function icon(paths: ReactNode, defaultSize = 16) {
  return function Icon({ size = defaultSize }: { size?: number }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ flex: 'none' }}
      >
        {paths}
      </svg>
    );
  };
}

const star = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';

export const SettingsIcon = icon(
  <>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </>,
  18,
);
export const ShieldIcon = icon(
  <>
    <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </>,
  15,
);
export const ShieldOffIcon = icon(
  <>
    <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
    <path d="M4 4l16 16" />
  </>,
  15,
);
export const BanIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </>,
);
export const SpellingIcon = icon(<path d="M3 18l4.5-12L12 18M4.7 14h5.6M14 15l2.5 2.5L21 12" />, 15);
export const ImproveIcon = icon(<path d="M4 20l10-10M16 2.5v3M16 9.5v3M11.5 7.5h2M18.5 7.5h2" />, 15);
export const TemplatesIcon = icon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 9h8M8 12.5h8M8 16h5" />
  </>,
  15,
);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />, 15);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </>,
  15,
);
export const ChevronRightIcon = icon(<path d="M9 6l6 6-6 6" />, 15);
export const ChevronDownIcon = icon(<path d="M6 9l6 6 6-6" />, 13);
export const BackIcon = icon(<path d="M15 6l-6 6 6 6" />, 18);
export const CloseIcon = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const SmallCloseIcon = icon(<path d="M6 6l12 12M18 6L6 18" />, 11);
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </>,
  14,
);
export const InsertIcon = icon(
  <>
    <path d="M12 3v11M7.5 9.5L12 14l4.5-4.5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </>,
  14,
);
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />, 14);
export const RefreshIcon = icon(
  <>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v5h-5" />
  </>,
  14,
);
export const KeyIcon = icon(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9M17 6l3 3" />
  </>,
);
export const ModelIcon = icon(
  <>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </>,
);
export const DownloadIcon = icon(<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14" />);
export const UploadIcon = icon(<path d="M12 20V9M7.5 13.5L12 9l4.5 4.5M5 4h14" />);
export const ChatIcon = icon(<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.5A7.5 7.5 0 1 1 20 11.5z" />, 24);
export const StarIcon = icon(<path d={star} />, 15);
export const StarFilledIcon = icon(<path d={star} fill="currentColor" />, 15);
export const ListIcon = icon(
  <>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" />
    <circle cx="4.5" cy="12" r="1" />
    <circle cx="4.5" cy="18" r="1" />
  </>,
  14,
);
export const PencilIcon = icon(<path d="M4 20h4L19 9l-4-4L4 16v4z" />, 14);
export const SparkIcon = icon(
  <>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    <path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
  </>,
  15,
);
export const SendIcon = icon(<path d="M5 12h13M13 6l6 6-6 6" />, 15);
export const EyeIcon = icon(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </>,
);
export const HistoryIcon = icon(<path d="M4 12a8 8 0 1 0 2.34-5.66M4 4v5h5M12 8v4l3 2" />);
export const UserIcon = icon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </>,
);
