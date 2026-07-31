"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ background: "#f4f7f5", color: "#12201d" }}>
        <main
          style={{
            margin: "15vh auto",
            maxWidth: 560,
            padding: 24,
            textAlign: "center",
          }}
        >
          <p
            style={{
              color: "#12624f",
              fontWeight: 800,
              textTransform: "uppercase",
            }}
          >
            Recuperação segura
          </p>
          <h1>O MeuMoney encontrou um problema</h1>
          <p>
            Seus dados não foram alterados e nenhuma informação financeira é
            incluída no relatório de erro.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              minHeight: 44,
              border: 0,
              borderRadius: 12,
              background: "#12624f",
              color: "white",
              padding: "0 20px",
              fontWeight: 700,
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
