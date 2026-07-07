import React, { useEffect } from 'react';
import MetroScene from './three/MetroScene.jsx';
import TopHud from './ui/TopHud.jsx';
import LinesPanel from './ui/LinesPanel.jsx';
import AlgoPanel from './ui/AlgoPanel.jsx';
import StationPanel from './ui/StationPanel.jsx';
import Legend from './ui/Legend.jsx';
import Tooltip from './ui/Tooltip.jsx';
import { useStore } from './state/store.js';

export default function App() {
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useStore.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        if (st.steps.length > 0) st.playing ? st.pause() : st.play();
      } else if (e.code === 'ArrowRight') {
        st.stepOnce();
      } else if (e.code === 'KeyR') {
        st.resetRun();
      } else if (e.code === 'Escape') {
        useStore.setState({ selectedStation: null, selectedLine: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <MetroScene />
      <div className="hud">
        <TopHud />
        <LinesPanel />
        <AlgoPanel />
        <StationPanel />
        <Legend />
        <Tooltip />
      </div>
    </div>
  );
}
