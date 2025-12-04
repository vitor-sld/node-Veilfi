async function test() {
  const url =
    "https://api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112" +
    "&outputMint=7CVaSUZJanCjcK3jZc87eF2iQkcesDF7c98titi8pump" +
    "&amount=10000000&slippage=1";

  const res = await fetch(url);
  const json = await res.json();
  console.log(json);
}

test();
