import fetch from "node-fetch";

async function testWithdraw() {
  const response = await fetch("http://localhost:3001/withdraw/sol", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: "UbxB29qQZgpLKniZCEV5nTQnTWyoUvHYADUMnruB5Np",
      amount: 0.0001
    }),
  });

  const result = await response.json();
  console.log("Result:", result);
}

testWithdraw();
