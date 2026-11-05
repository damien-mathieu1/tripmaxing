export type Pin = {
  id: number;
  title: string;
  lang: string;
  image?: string;
  family?: string;
  trend?: number;
  views: number;
};

export const RISING_TREND = 1.5;
export const RISING_MIN_VIEWS = 100;

export const isRising = ({ trend, views }: Pin) =>
  (trend ?? 0) >= RISING_TREND && views >= RISING_MIN_VIEWS;

export const photoUrl = (image: string, width: number) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=${width}`;

export const wikipediaUrl = ({ lang, title }: Pin) =>
  `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
