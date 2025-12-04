const fetch = require("node-fetch");

(async () => {
  const mint = "7CVaSUZJanCjcK3jZc87eF2iQkcesDF7c98titi8pump";
  const url = `https://frontend-api.pump.fun/token/${mint}`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log("RAW:", text);
  } catch (e) {
    console.error("ERR:", e);
  }
})();
