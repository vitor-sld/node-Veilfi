async function test() {
  const url =
    "https://api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112" +
    "&outputMint=VSKXrgwu5mtbdSZS7Au81p1RgLQupWwYXX1L2cWpump" +
    "&amount=10000000&slippage=1";

  const res = await fetch(url);
  const json = await res.json();
  console.log(json);
}

test();
