"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body>
        <main
          style={{
            margin: "15vh auto",
            maxWidth: 560,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1>O MeuMoney encontrou um problema</h1>
          <p>Nenhum dado financeiro é incluído no relatório de erro.</p>
          <button onClick={reset}>Tentar novamente</button>
        </main>
      </body>
    </html>
  );
}
