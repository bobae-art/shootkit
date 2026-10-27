// Same output type as the upstream ShortformStudio; kept separate so the kit
// does not import the unrelated dealer inventory application during type checks.
import type { ShortformAspect, ShortformTemplate } from "./render";

export type MadeShortform = {
  id: string;
  url: string;
  poster: string;
  carId: number;
  title: string;
  template: ShortformTemplate;
  seconds: number;
  aspect: ShortformAspect;
};
