import { describe, expect, it } from "vitest";
import { addressKey } from "./http";

describe("addressKey", () => {
	it("keeps IPv4 addresses", () => {
		expect(addressKey("203.0.113.7")).toBe("203.0.113.7");
	});

	it("groups IPv6 addresses by /64", () => {
		expect(addressKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
		expect(addressKey("2001:db8:1:2::9")).toBe("2001:db8:1:2::/64");
		expect(addressKey("2001:0db8::1")).toBe("2001:db8:0:0::/64");
		expect(addressKey("2001:DB8:1:2:3:4:5:6")).toBe(addressKey("2001:db8:1:2:ffff::"));
	});
});
