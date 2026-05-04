export default function TdOneLogo() {
  return (
    <div
      style={{
        background: "#1c1917",
        borderRadius: "14px",
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "14px",
        width: "100%",
      }}
    >
      <div
        style={{
          width: "42px",
          height: "42px",
          border: "1px solid #fafaf9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "12px",
            height: "12px",
            background: "#fafaf9",
          }}
        />
      </div>

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: "22px",
            fontWeight: 200,
            color: "#fafaf9",
            letterSpacing: "8px",
            lineHeight: 1,
          }}
        >
          TD ONE
        </div>
        <div
          style={{
            fontSize: "8px",
            color: "#a8a29e",
            letterSpacing: "4px",
            fontWeight: 400,
            marginTop: "10px",
            textTransform: "uppercase",
          }}
        >
          ThaiDrill Lao
        </div>
      </div>
    </div>
  );
}
