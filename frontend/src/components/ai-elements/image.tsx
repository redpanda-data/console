import { cn } from "components/redpanda-ui/lib/utils";
import type { Experimental_GeneratedImage } from "ai";

export type ImageProps = Experimental_GeneratedImage & {
  className?: string;
  alt?: string;
};

/**
 * `Experimental_GeneratedImage` from the `ai` package ships both a `base64`
 * string and a `uint8Array` byte buffer containing the same image bytes — they
 * are two representations of one value. Browsers render images via
 * `data:<mime>;base64,<payload>` URIs, so the `base64` field covers every case
 * the `uint8Array` would. Pulling `uint8Array` into a discarded underscore
 * variable keeps it out of `...props` (it would otherwise land on the `<img>`
 * DOM element and trigger a React warning) while silencing the unused-var
 * lint rule. If we ever need raw bytes (e.g. to feed a `Blob` for download),
 * rename to `uint8Array` and handle it explicitly.
 */
export const Image = ({
  base64,
  uint8Array: _uint8Array,
  mediaType,
  ...props
}: ImageProps) => (
  <img
    {...props}
    alt={props.alt}
    className={cn(
      "h-auto max-w-full overflow-hidden rounded-md",
      props.className
    )}
    src={`data:${mediaType};base64,${base64}`}
  />
);
