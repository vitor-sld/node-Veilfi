import React, { useState, useEffect, JSX } from "react";
import * as S from "./styles";

import { useAuth } from "../../hooks/useAuth";
import {
  Connection,
  Keypair,
  VersionedTransaction,
} from "@solana/web3.js";

import bs58 from "bs58";

/* ------------------------------------------
   CONFIGURAÇÕES
------------------------------------------- */
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://node-veilfi-jtae.onrender.com";
const RPC_ENDPOINT = import.meta.env.VITE_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";

/* ------------------------------------------
   HELPERS
------------------------------------------- */
function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default function SwapPage(): JSX.Element {
  const auth = useAuth();

  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<"SOL" | "USDC">("SOL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [quoteInfo, setQuoteInfo] = useState<{
    outAmount?: string;
    priceImpact?: string;
  }>({});

  const [isGettingQuote, setIsGettingQuote] = useState(false);

  const from = auth?.session?.walletAddress || "";
  const secretKey = auth?.session?.secretKey || "";

  /* ------------------------------------------
     PRIVATE KEY PARSER
  ------------------------------------------- */
  function parsePrivateKey(secretKey: string): Keypair {
    try {
      if (secretKey.startsWith("[")) {
        return Keypair.fromSecretKey(new Uint8Array(JSON.parse(secretKey)));
      }
      return Keypair.fromSecretKey(bs58.decode(secretKey));
    } catch (e: any) {
      throw new Error("Chave privada inválida.");
    }
  }

  /* ------------------------------------------
     INPUT VALIDATION
  ------------------------------------------- */
  function validateInputs() {
    if (!from) {
      setError("Carteira não conectada.");
      return false;
    }
    if (!secretKey) {
      setError("Chave privada não encontrada.");
      return false;
    }

    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) {
      setError("Insira um valor válido.");
      return false;
    }

    return true;
  }

  /* ------------------------------------------
     OBTÉM COTAÇÃO (via BACKEND -> JUPITER)
  ------------------------------------------- */
  async function getQuote() {
    if (!amount || Number(amount) <= 0) {
      setQuoteInfo({});
      return;
    }

    const amt = Number(amount);
    const inputMint = token === "SOL" ? SOL_MINT : USDC_MINT;
    const outputMint = token === "SOL" ? USDC_MINT : SOL_MINT;

    const smallest =
      token === "SOL"
        ? Math.floor(amt * 1_000_000_000)
        : Math.floor(amt * 1_000_000);

    try {
      setIsGettingQuote(true);

      const res = await fetch(`${BACKEND_URL}/jupiter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carteiraUsuarioPublica: from,
          carteiraUsuarioPrivada: secretKey,
          inputMint,
          outputMint,
          amount: smallest,
        }),
      });

      if (!res.ok) {
        console.error("Quote backend error:", await res.text());
        setQuoteInfo({});
        return;
      }

      const data = await res.json();

      if (!data.outAmount) {
        setQuoteInfo({});
        return;
      }

      const out =
        token === "SOL"
          ? (data.outAmount / 1_000_000).toFixed(2)
          : (data.outAmount / 1_000_000_000).toFixed(6);

      const symbol = token === "SOL" ? "USDC" : "SOL";

      setQuoteInfo({
        outAmount: `${out} ${symbol}`,
        priceImpact: data.priceImpactPct
          ? `${(data.priceImpactPct * 100).toFixed(2)}%`
          : undefined,
      });
    } catch (err) {
      console.error("Erro ao obter cotação:", err);
      setQuoteInfo({});
    } finally {
      setIsGettingQuote(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => getQuote(), 500);
    return () => clearTimeout(t);
  }, [amount, token]);

  /* ------------------------------------------
     HANDLE SWAP (JUPITER swap-in -> backend send)
  ------------------------------------------- */
  async function handleSwap() {
    setError("");

    if (!validateInputs()) return;

    setLoading(true);

    try {
      const amt = Number(amount);
      const inputMint = token === "SOL" ? SOL_MINT : USDC_MINT;
      const outputMint = token === "SOL" ? USDC_MINT : SOL_MINT;

      const smallest =
        token === "SOL"
          ? Math.floor(amt * 1_000_000_000)
          : Math.floor(amt * 1_000_000);

      // 1) GET QUOTE
      const quoteRes = await fetch(`${BACKEND_URL}/jupiter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carteiraUsuarioPublica: from,
          carteiraUsuarioPrivada: secretKey,
          inputMint,
          outputMint,
          amount: smallest,
        }),
      });

      const quote = await quoteRes.json();
      if (!quote.outAmount) throw new Error("Liquidez insuficiente.");

      // 2) REQUEST swapTransaction FROM JUPITER via backend
      const swapRes = await fetch(`${BACKEND_URL}/swap/jupiter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carteiraUsuarioPublica: from,
          carteiraUsuarioPrivada: secretKey,
          quote,
        }),
      });

      const swapJson = await swapRes.json();

      if (!swapJson.swapTransaction) {
        console.error("swap/jupiter returned:", swapJson);
        throw new Error("Erro ao gerar transação.");
      }

      // 3) SIGN locally
      const txBuf = base64ToUint8Array(swapJson.swapTransaction);
      const tx = VersionedTransaction.deserialize(txBuf as any);

      const user = parsePrivateKey(secretKey);
      tx.sign([user]);

      // 4) SEND to network
      const connection = new Connection(RPC_ENDPOINT, "confirmed");

      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      alert(`Swap enviado!\nTX: ${sig}`);

      setAmount("");
      setQuoteInfo({});
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro no swap");
    } finally {
      setLoading(false);
    }
  }

  /* ------------------------------------------
     UI
  ------------------------------------------- */
  return (
    <S.PageContainer>
      <S.NavBar>
        <button onClick={() => window.history.back()}>← Voltar</button>
        <h2>Swap (Jupiter)</h2>
      </S.NavBar>

      <S.Box>
        <h2>Swap SOL ↔ USDC</h2>

        {/* Carteira */}
        <S.Field>
          <label>Carteira</label>
          <div
            style={{
              padding: 10,
              fontSize: 14,
              background: "#f5f5f5",
              color: "#333",
              borderRadius: 6,
              wordBreak: "break-all",
            }}
          >
            {from || "Nenhuma carteira conectada"}
          </div>
        </S.Field>

        {/* Token */}
        <S.Field>
          <label>Token para enviar</label>
          <select
            value={token}
            onChange={(e) => {
              setToken(e.target.value as "SOL" | "USDC");
              setQuoteInfo({});
            }}
          >
            <option value="SOL">SOL</option>
            <option value="USDC">USDC</option>
          </select>
        </S.Field>

        {/* Amount */}
        <S.Field>
          <label>Quantidade ({token})</label>
          <input
            value={amount}
            onChange={(e) => {
              const value = e.target.value.replace(",", ".");
              if (value === "" || /^\d*\.?\d*$/.test(value)) {
                setAmount(value);
              }
            }}
            placeholder="0.1"
          />
        </S.Field>

        {/* Quote info */}
        {quoteInfo.outAmount && (
          <div
            style={{
              background: "#e9ffe9",
              padding: 12,
              borderRadius: 6,
              marginTop: 10,
              border: "1px solid #bde5bd",
            }}
          >
            <strong>Você receberá: </strong> {quoteInfo.outAmount}
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              background: "#ffe5e5",
              padding: 12,
              borderRadius: 6,
              color: "#900",
              marginTop: 10,
            }}
          >
            ❌ {error}
          </div>
        )}

        {/* Swap button */}
        <button
          onClick={handleSwap}
          disabled={loading}
          style={{
            marginTop: 20,
            padding: 14,
            fontSize: 18,
            background: loading ? "#888" : "#3b82f6",
            borderRadius: 8,
            color: "white",
            cursor: "pointer",
          }}
        >
          {loading ? "Processando..." : "Fazer Swap"}
        </button>
      </S.Box>
    </S.PageContainer>
  );
}
