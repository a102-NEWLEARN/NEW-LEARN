import type * as React from 'react';

/** Monochrome icon names (Seed Icon). Each has a `line` and a `fill` variant. */
export type IconName = "a-uppercase-a-lowercase" | "a-uppercase-outline" | "a-uppercase-square" | "androidshare" | "apple" | "arrow2-clockwise-circular" | "arrow2-clockwise-rectangular" | "arrow-clockwise-circular" | "arrow-clockwise-oval" | "arrow-counterclockwise-circular" | "arrow-down" | "arrow-down-horizline" | "arrow-down-line-vertical-arrow-up-square" | "arrow-down-right-arrow-up-left" | "arrow-left-bracket-right" | "arrow-left" | "arrow-right-angled" | "arrow-right-arrow-left" | "arrow-right" | "arrow-up-arrow-down" | "arrow-up-bracket-down" | "arrow-up" | "arrow-up-left" | "arrow-up-right-arrow-down-left-coupon" | "arrow-up-right-arrow-down-left" | "arrow-up-right-arrow-down-left-square" | "arrow-up-right" | "arrow-up-right-shoppingbag-tilted" | "arrow-up-right-small" | "arrow-uturn-left" | "arrow-uturn-right" | "article" | "asterisk-horizrectangle-coolwave3" | "at" | "atm" | "b-uppercase" | "backspacekey" | "barchart-board" | "barchart-square" | "bed-frontside" | "bell" | "bell-slash" | "bluetooth" | "book" | "book-open" | "bookmark" | "box-flap" | "bracket-left-arrow-right" | "broom" | "building2" | "building2-twosize" | "bus-frontside" | "calendar" | "camcorder" | "camera" | "car" | "car-front-upside-wave2-reversed-up" | "car-frontside" | "car-rear-trunk-open-leftside" | "car-rear-upside-sector-down" | "car-rear-upside-wave2-reversed-down" | "car-rear-upside-wave2-reversed-down-left" | "card" | "cart" | "cart-items" | "cart-load" | "checkmark-badge" | "checkmark-ballotbox" | "checkmark-calendar" | "checkmark-chatbubble-left" | "checkmark-circle" | "checkmark-clipboard" | "checkmark-coupon" | "checkmark-fat" | "checkmark" | "checkmark-flower" | "checkmark-horizline" | "checkmark-scale" | "checkmark-shield" | "checkmarkhorizline2-vertical" | "chefhat" | "chevron-down" | "chevron-down-small" | "chevron-left" | "chevron-left-small" | "chevron-right" | "chevron-right-small" | "chevron-up" | "chevron-up-small" | "circle4-square" | "clock" | "compass" | "corner4-inward" | "corner4-outward" | "corner-down-left" | "coupon" | "cropmark" | "crosshair" | "crosshair-questionmark" | "crown" | "cup-heatwave" | "diamond" | "document-arrow-left" | "document-checkmark" | "document" | "document-magnifyingglass" | "document-pen" | "document-plus" | "document-tray" | "dollar-circle-arrow-right" | "dollar-circle" | "dollar" | "dot3-circle" | "dot3-horizontal-chatbubble-left" | "dot3-horizontal-chatbubble-left-slash" | "dot3-horizontal" | "dot3-vertical" | "dothorizline3-vertical" | "dumbbell" | "earth" | "envelope" | "epb" | "eraser-horizline" | "exclamationmark-chatbubble-rectangular-center" | "exclamationmark-circle" | "exclamationmark-triangle" | "eye" | "eye-slash" | "face-frustrated-circle" | "face-sad-circle" | "face-smile-circle" | "face-smile-circle-folded" | "face-surprised-circle" | "face-viewfinder" | "figure-bike" | "figure-oval" | "figure-run" | "figure-walk" | "figure-wheelchair" | "fingerprint" | "firework" | "fish-wave2" | "flag" | "flag-hill" | "flame" | "flask" | "fork-spoon-bag" | "fork-spoon" | "fridge" | "gamepad" | "gear" | "gift" | "glasses" | "globe" | "graduationcap" | "grid-dot5" | "grid" | "grid-heart" | "hand-point-up" | "hand-wave" | "hardhat" | "hash" | "headphone" | "headset" | "heart" | "horizline2-vertical-chatbubble-rectangular-right" | "horizline2-vertical-chatbubble-rectangular-right-slash" | "horizline3-vertical-checkmark" | "horizline3-vertical" | "horizline3-vertical-star" | "horizline3-vertical-tight" | "horizline-viewfinder" | "horizrectangle-horizline2-vertical" | "hospitalcross-building" | "hospitalcross-shield" | "hospitalcross-square" | "house-card" | "house" | "house-plus" | "house-square" | "i-lowercase-serif-circle" | "keyboard-chevron-down" | "keyhole-shield" | "laptop" | "leaf" | "lightbulb-dot5" | "lightning" | "lightning-slash" | "linechart-up-xaxis" | "locationpin" | "lock" | "lock-opened" | "magnifyingglass" | "magnifyingglass-sparkle" | "malesymbol-femalesymbol" | "map" | "map-locationpin" | "megaphone" | "megaphone-tilted" | "metro-frontside" | "microphone" | "microphone-slash" | "microwave" | "midcut-square" | "minus-circle" | "minus-fat" | "minus" | "mobile" | "moon" | "musicalnote-double" | "n-uppercase-circle" | "nailpolish" | "needle-scale" | "p-uppercase-circle" | "paintroller" | "palette" | "paperclip" | "paperplane" | "paperplane-tilted" | "pawprint" | "pen-horizline" | "pencil" | "people3" | "percent" | "percent-flower" | "person2" | "person2-openarms" | "person-circle" | "person" | "person-flower" | "person-magnifyingglass" | "person-plus" | "person-shield" | "phone" | "phone-xmark" | "picture2-stacked" | "picture" | "plate-covered" | "plus-circle" | "plus" | "plus-small" | "plus-square" | "post" | "pushpin" | "pushpin-slash" | "q-uppercase-chatbubble-right" | "questionmark-circle" | "questionmark-square" | "quotationmark2-left" | "quotationmark2-right" | "receipt" | "rectangle-splited-line-vertical" | "roadlane" | "rocket" | "rooftoproom" | "s-uppercase-horizline-center" | "scissors" | "scribble" | "seat-left-fan" | "seat-left" | "seat-left-heatwave2" | "shoppingbag2-stacked" | "shoppingbag" | "shoppingbag-items" | "sidemirror-wave" | "signboard" | "slash-circle" | "slash-semicircle2" | "slash-semicircle2-slash" | "slider2-horizontal" | "smartkey" | "sneaker-lifted-leftside" | "sofa" | "sparkle2" | "sparkle-arrow-up" | "sparkle-viewfinder" | "speaker-wave2" | "speaker-wave2-slash" | "speedometer-1x" | "speedometer-2x" | "speedometer-3x" | "speedometer" | "splited-grid-square" | "spraybottle-sponge" | "square2-stacked" | "square-splited-vertical-left" | "squareline2-vertical" | "star" | "steeringwheel-heatwave2" | "steps" | "store-checkmark" | "store" | "store-pen" | "sun" | "t-uppercase-serif" | "t-uppercase-t-lowercase" | "tag" | "text-aligncenter" | "text-alignleft" | "text-alignright" | "thumb-down" | "thumb-up" | "timer-10" | "timer-3" | "timer" | "toolbox" | "translation" | "trashcan" | "treasure-chest" | "triangle-down-small" | "triangle-right-chatbubble-left" | "triangle-right" | "triangle-right-rectangle-splited-line-vertical" | "triangle-up-small" | "trophy" | "truck" | "tshirt-bubble2" | "tshirt" | "u-uppercase-horizline" | "vertline3-viewfinder" | "vertline4-sparkle" | "vertline-coupon" | "vertrectangle2-horizontal" | "vertrectangle-folded" | "votingstamp" | "wand" | "wand-plus-circle" | "washingmachine" | "window2-store-doubleband" | "window2-store" | "window4-house" | "won-arrow-clockwise-circular" | "won-circle-arrow-left" | "won-circle-arrow-right" | "won-circle" | "won" | "won-shield" | "wrench" | "xmark-circle" | "xmark" | "xmark-scale" | "yen-circle-arrow-right" | "yen-circle" | "yen";

/** Multicolor icon names (Seed Icon). Fixed colors; no variant. */
export type MulticolorIconName = "animal-face" | "apple" | "arrow-up-right-arrow-down-left-coupon" | "arrow-up-right-shoppingbag-tilted" | "arrowshape-circle2" | "asterisk-horizrectangle-coolwave3" | "atm" | "bell" | "book" | "box-flap" | "building2" | "building2-twosize" | "camcorder" | "camera" | "car-frontside" | "car-frontside-bubble" | "card" | "cart" | "cart-items" | "cart-load" | "chatbubble2" | "checkmark-calendar" | "clapperboard-star" | "clover4" | "cup-heatwave" | "cup-takeout" | "cupcake" | "diamond" | "document-seal" | "dome-pillar3" | "donut" | "duck-leftside" | "dumbbell" | "envelope" | "exclamationmark-triangle" | "eyebrow" | "face-laughing-circle" | "face-smile-circle" | "figure-walk" | "fish-wave2" | "flower" | "fork-spoon" | "fork-spoon-bag" | "fraction-1-n-uppercase" | "gamepad" | "gift" | "glasses" | "grid-dot5" | "hand-drop" | "hifive-star" | "horizline-viewfinder" | "hospital" | "house-card" | "icecreamcone" | "linechart-up-xaxis" | "magnifyingglass" | "mask2-smile-stacked" | "megaphone-tilted" | "monitor" | "nailpolish" | "paintroller" | "palette" | "pencil" | "percent-arrowshape-down" | "person2-openarms" | "person-magnifyingglass" | "picture" | "picture2-stacked" | "pizza-slice" | "plate-covered" | "post" | "rocket" | "roundmeat-bottombone" | "scissors" | "shoppingbag2-stacked" | "shoppingbag-items" | "sneaker-lifted-leftside" | "sofa" | "sparkle2" | "sparkle-arrow-up" | "spraybottle-sponge" | "squareline2-vertical" | "star-calendar" | "tennis-ball" | "treasure-chest" | "tree" | "triangle-right-chatbubble-left" | "trophy" | "truck" | "tshirt-bubble2" | "vertrectangle-tiltedstacked" | "vest-horizstripe" | "wand-plus-circle" | "warninglight" | "window2-store" | "window2-store-doubleband" | "window4-house" | "won-circle" | "won-shield" | "wrench";

/** A color token ("fg.brand", "fg-brand", "palette.green-600") or any CSS color. Default: currentColor. */
export type IconColor = string;
/** A number (px), a dimension token ("x6" = 24px, "dimension-x5"), or any CSS length. Default: 24px. */
export type IconSize = number | string;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'color'> {
  /** Bundled Seed icon to draw. Ignored when `svg` is given. */
  name?: IconName;
  /** Line (default) or Fill. Use Fill at 15px and below, and for on/off or selected states. */
  variant?: 'line' | 'fill';
  /** SEED-compatible: an svg element of your own (e.g. <IconHeartLine /> from @karrotmarket/react-monochrome-icon). */
  svg?: React.ReactNode;
  size?: IconSize;
  color?: IconColor;
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  label?: string;
}
export declare const Icon: React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>;

export interface MulticolorIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name'> {
  name: MulticolorIconName;
  size?: IconSize;
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  label?: string;
}
export declare const MulticolorIcon: React.ForwardRefExoticComponent<MulticolorIconProps & React.RefAttributes<SVGSVGElement>>;

/** SEED slots for an icon placed before / after a label inside another component. Always aria-hidden. */
export interface PrefixIconProps { svg: React.ReactNode; className?: string }
export declare const PrefixIcon: React.ForwardRefExoticComponent<PrefixIconProps & React.RefAttributes<HTMLSpanElement>>;
export interface SuffixIconProps { svg: React.ReactNode; className?: string }
export declare const SuffixIcon: React.ForwardRefExoticComponent<SuffixIconProps & React.RefAttributes<HTMLSpanElement>>;

export declare const iconNames: IconName[];
export declare const multicolorIconNames: MulticolorIconName[];
/** SVG markup (fill="currentColor") for use outside React. */
export declare function iconSvg(name: IconName, variant?: 'line' | 'fill', size?: number): string | null;
export declare function multicolorIconSvg(name: MulticolorIconName, size?: number): string | null;
/** Names whose name or Korean/English keywords contain every term of `query`. */
export declare function searchIcons(query: string, kind?: 'monochrome' | 'multicolor'): string[];
/** Keywords and the matching component name in the official SEED icon packages. */
export declare function iconInfo(name: string, kind?: 'monochrome' | 'multicolor'): { name: string; keywords: string; seedComponent: string | { line: string; fill: string }; seedPackage: string } | null;

declare global {
  interface Window {
    SeedDesign: {
      Icon: typeof Icon; MulticolorIcon: typeof MulticolorIcon; PrefixIcon: typeof PrefixIcon; SuffixIcon: typeof SuffixIcon;
      iconNames: typeof iconNames; multicolorIconNames: typeof multicolorIconNames;
      iconSvg: typeof iconSvg; multicolorIconSvg: typeof multicolorIconSvg; searchIcons: typeof searchIcons; iconInfo: typeof iconInfo;
    };
  }
}
