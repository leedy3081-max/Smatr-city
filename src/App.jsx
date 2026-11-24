
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const BUILDINGS = [
  { id: "park", name: "도심 공원", icon: "🌳", cost: 5000, environment: 10, happiness: 8, technology: 0, economy: 0, traffic: 0 },
  { id: "solar", name: "태양광 발전소", icon: "☀️", cost: 12000, environment: 12, happiness: 1, technology: 2, economy: 2, traffic: 0 },
  { id: "ai_center", name: "AI 데이터 센터", icon: "🤖", cost: 20000, environment: -5, happiness: 1, technology: 15, economy: 12, traffic: 2 },
  { id: "smart_road", name: "스마트 도로", icon: "🛣️", cost: 15000, environment: -1, happiness: 4, technology: 8, economy: 5, traffic: 15 },
  { id: "hospital", name: "스마트 병원", icon: "🏥", cost: 18000, environment: 0, happiness: 15, technology: 5, economy: 2, traffic: 0 },
  { id: "school", name: "미래형 학교", icon: "🏫", cost: 14000, environment: 1, happiness: 10, technology: 6, economy: 5, traffic: 0 },
  { id: "factory", name: "첨단 산업 단지", icon: "🏭", cost: 22000, environment: -8, happiness: -2, technology: 7, economy: 18, traffic: -2 },
  { id: "housing", name: "스마트 주거 단지", icon: "🏢", cost: 16000, environment: -2, happiness: 10, technology: 5, economy: 5, traffic: -2 },
  { id: "wind", name: "풍력 발전소", icon: "🌬️", cost: 13000, environment: 14, happiness: 2, technology: 2, economy: 1, traffic: 0 }
];

const clamp = value => Math.max(0, Math.min(100, value));

export default function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [city, setCity] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [selected, setSelected] = useState(BUILDINGS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadCity();
    else {
      setCity(null);
      setBuildings([]);
    }
  }, [session]);

  async function authenticate(type) {
    if (!email || !password) {
      setMessage("이메일과 비밀번호를 입력해 줘.");
      return;
    }

    setBusy(true);
    setMessage("");

    const result = type === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(result.error.message);
    } else if (type === "signup") {
      setMessage("가입 요청 완료! 이메일 인증이 필요할 수 있어.");
    }

    setBusy(false);
  }

  async function loadCity() {
    setBusy(true);
    setMessage("");

    const { data: cities, error } = await supabase
      .from("cities")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    let currentCity = cities?.[0];

    if (!currentCity) {
      const { data, error: createError } = await supabase
        .from("cities")
        .insert({
          user_id: session.user.id,
          name: "나의 첫 번째 도시"
        })
        .select()
        .single();

      if (createError) {
        setMessage(createError.message);
        setBusy(false);
        return;
      }

      currentCity = data;

      await supabase.from("city_history").upsert({
        city_id: data.id,
        month: 1,
        budget: data.budget,
        population: data.population,
        environment: data.environment,
        traffic: data.traffic,
        economy: data.economy,
        happiness: data.happiness,
        technology: data.technology,
        sustainability: 50
      }, { onConflict: "city_id,month" });
    }

    setCity(currentCity);
    await loadBuildings(currentCity.id);
    setBusy(false);
  }

  async function loadBuildings(cityId) {
    const { data, error } = await supabase
      .from("city_buildings")
      .select("*")
      .eq("city_id", cityId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setBuildings(data || []);
  }

  async function buildAt(x, y) {
    if (!city || busy) return;

    if (buildings.some(b => b.grid_x === x && b.grid_y === y)) {
      setMessage("이미 건물이 있는 위치야!");
      return;
    }

    if (city.budget < selected.cost) {
      setMessage("예산이 부족해!");
      return;
    }

    setBusy(true);

    const { error: buildingError } = await supabase
      .from("city_buildings")
      .insert({
        city_id: city.id,
        building_id: selected.id,
        grid_x: x,
        grid_y: y
      });

    if (buildingError) {
      setMessage(buildingError.message);
      setBusy(false);
      return;
    }

    const updated = {
      budget: city.budget - selected.cost,
      environment: clamp(city.environment + selected.environment),
      traffic: clamp(city.traffic + selected.traffic),
      economy: clamp(city.economy + selected.economy),
      happiness: clamp(city.happiness + selected.happiness),
      technology: clamp(city.technology + selected.technology)
    };

    const { data, error } = await supabase
      .from("cities")
      .update(updated)
      .eq("id", city.id)
      .select()
      .single();

    if (error) {
      setMessage("도시 정보 저장에 실패했어. 새로고침 후 확인해 줘.");
    } else {
      setCity(data);
      setMessage(`${selected.name} 건설 완료!`);
    }

    await loadBuildings(city.id);
    setBusy(false);
  }

  async function nextMonth() {
    if (!city || busy) return;

    setBusy(true);

    const next = {
      month: city.month + 1,
      budget: city.budget + 8000,
      population: city.population + 50,
      environment: clamp(city.environment - 1),
      traffic: clamp(city.traffic - 1),
      economy: clamp(city.economy + 2),
      happiness: clamp(city.happiness + 1),
      technology: city.technology
    };

    const sustainability = Math.round(
      next.environment * 0.4 +
      next.economy * 0.3 +
      next.happiness * 0.3
    );

    const { data, error } = await supabase
      .from("cities")
      .update(next)
      .eq("id", city.id)
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    const { error: historyError } = await supabase
      .from("city_history")
      .upsert({
        city_id: city.id,
        ...next,
        sustainability
      }, { onConflict: "city_id,month" });

    setCity(data);
    setMessage(historyError
      ? "도시는 진행됐지만 월별 기록 저장에 실패했어."
      : `${next.month}개월 차가 시작됐어!`);

    setBusy(false);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  if (!session) {
    return (
      <main className="login-screen">
        <div className="login-card">
          <div className="logo">SMART CITY</div>
          <p className="eyebrow">THE FUTURE STARTS HERE</p>
          <h1>미래 도시의<br />시장이 되어보세요.</h1>
          <p className="muted">
            도시를 건설하고, 정책을 선택하고, 미래를 설계하세요.
          </p>

          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <button disabled={busy} onClick={() => authenticate("signin")}>
            로그인
          </button>
          <button className="secondary" disabled={busy} onClick={() => authenticate("signup")}>
            회원가입
          </button>

          {message && <p className="message">{message}</p>}
        </div>
      </main>
    );
  }

  if (!city) {
    return (
      <main className="loading">
        {message || "도시를 준비하고 있어..."}
      </main>
    );
  }

  const sustainability = Math.round(
    city.environment * 0.4 +
    city.economy * 0.3 +
    city.happiness * 0.3
  );

  const stats = [
    ["환경", city.environment, "🌿"],
    ["교통", city.traffic, "🚦"],
    ["경제", city.economy, "📈"],
    ["행복도", city.happiness, "😊"],
    ["기술", city.technology, "🤖"]
  ];

  return (
    <main className="game">
      <header className="topbar">
        <div>
          <div className="logo">SMART CITY</div>
          <span className="eyebrow">THE FUTURE</span>
        </div>
        <button className="small-button" onClick={logout}>
          로그아웃
        </button>
      </header>

      <section className="welcome">
        <div>
          <p className="eyebrow">MAYOR'S OFFICE</p>
          <h1>{city.name}</h1>
          <p className="muted">{city.month}개월 차 · 도시 운영 중</p>
        </div>
        <div className="score">
          <span>지속가능성 지수</span>
          <strong>{sustainability}</strong>
          <small>/ 100</small>
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <span>💰 예산</span>
          <strong>{city.budget.toLocaleString()}원</strong>
        </div>
        <div className="stat">
          <span>👥 인구</span>
          <strong>{city.population.toLocaleString()}명</strong>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">CITY DASHBOARD</p>
        <h2>도시 현황</h2>

        <div className="metric-grid">
          {stats.map(([name, value, icon]) => (
            <div className="metric" key={name}>
              <span>{icon} {name}</span>
              <strong>{value}</strong>
              <div className="bar">
                <div style={{ width: `${value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">BUILD YOUR FUTURE</p>
        <h2>도시 건설</h2>
        <p className="muted">
          건설할 시설을 선택하고 지도에서 원하는 칸을 눌러봐.
        </p>

        <div className="building-list">
          {BUILDINGS.map(building => (
            <button
              key={building.id}
              className={`building-option ${selected.id === building.id ? "active" : ""}`}
              onClick={() => setSelected(building)}
            >
              <span>{building.icon}</span>
              <b>{building.name}</b>
              <small>{building.cost.toLocaleString()}원</small>
            </button>
          ))}
        </div>

        <div className="selected-info">
          <b>{selected.icon} {selected.name}</b>
          <span>건설 비용 {selected.cost.toLocaleString()}원</span>
        </div>

        <div className="city-grid">
          {Array.from({ length: 64 }, (_, index) => {
            const x = index % 8;
            const y = Math.floor(index / 8);
            const placed = buildings.find(
              b => b.grid_x === x && b.grid_y === y
            );
            const info = placed
              ? BUILDINGS.find(b => b.id === placed.building_id)
              : null;

            return (
              <button
                key={index}
                className={`tile ${placed ? "occupied" : ""}`}
                onClick={() => buildAt(x, y)}
                disabled={busy}
                title={info?.name || "빈 부지"}
              >
                {info ? info.icon : "＋"}
              </button>
            );
          })}
        </div>

        <p className="map-caption">CITY MAP · 8 × 8 GRID</p>
      </section>

      <section className="panel month-panel">
        <p className="eyebrow">TIME MANAGEMENT</p>
        <h2>다음 달로 이동</h2>
        <p className="muted">
          한 달이 지나면 기본 운영 수입과 인구 변화가 적용돼.
        </p>
        <button
          className="primary-button"
          disabled={busy}
          onClick={nextMonth}
        >
          {busy ? "처리 중..." : "한 달 진행하기 →"}
        </button>
      </section>

      {message && <div className="toast">{message}</div>}

      <footer>
        SMART CITY : THE FUTURE · CITY SIMULATION
      </footer>
    </main>
  );
}
