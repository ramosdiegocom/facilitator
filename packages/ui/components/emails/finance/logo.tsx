import { X402_METADATA } from "@ramoz/shared/metadata/x402";
import { Img } from "@react-email/components";

export function Logo() {
	return (
		<div className="mb-6 flex items-baseline gap-2">
			<Img
				alt={`${X402_METADATA.displayName} logo`}
				className="aspect-square size-8 object-contain"
				height="50"
				src={`https://${X402_METADATA.domain}/logo.png`}
				width="50"
			/>
			<span className="font-bold text-3xl">{X402_METADATA.displayName}</span>
		</div>
	);
}
