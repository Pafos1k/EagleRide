
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { motion } from 'motion/react';

const USAMap: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bostonPos, setBostonPos] = useState<{ x: number; y: number } | null>(null);
  const dotsRef = useRef<{ x: number; y: number; delay: number }[]>([]);
  const animationRef = useRef<number>(null);

  useEffect(() => {
    const width = 800;
    const height = 500;
    const spacing = 6; // Even denser for a more solid black look

    const projection = d3.geoAlbersUsa()
      .scale(1000)
      .translate([width / 2, height / 2]);

    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/nation-10m.json").then((us: any) => {
      if (!us) return;

      const nation = topojson.feature(us, us.objects.nation) as any;
      const land = nation.features[0];

      const dotGrid: { x: number; y: number; delay: number }[] = [];
      
      for (let x = 0; x < width; x += spacing) {
        for (let y = 0; y < height; y += spacing) {
          const coords = projection.invert!([x, y]);
          if (coords && d3.geoContains(land, coords)) {
            dotGrid.push({ 
              x, 
              y, 
              delay: (x + y) * 1.0 // Slightly faster entrance
            });
          }
        }
      }
      dotsRef.current = dotGrid;

      // Boston Position
      const bCoords: [number, number] = [-71.0589, 42.3601];
      const projectedB = projection(bCoords);
      if (projectedB) {
        setBostonPos({ x: projectedB[0], y: projectedB[1] });
      }

      startAnimation();
    });

    const startAnimation = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      const startTime = performance.now();

      const render = (time: number) => {
        const elapsed = time - startTime;
        ctx.clearRect(0, 0, width, height);
        
        ctx.fillStyle = '#000000';
        
        dotsRef.current.forEach((dot) => {
          const dotProgress = Math.max(0, Math.min(1, (elapsed - dot.delay) / 500));
          if (dotProgress <= 0) return;

          ctx.globalAlpha = dotProgress; // Solid opacity for all dots to be "more black"
          
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, 2.4, 0, Math.PI * 2); 
          ctx.fill();
        });

        animationRef.current = requestAnimationFrame(render);
      };

      animationRef.current = requestAnimationFrame(render);
    };

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent overflow-hidden relative">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5 }}
        className="relative z-10 w-full h-full flex items-center justify-center p-12"
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 'auto', maxWidth: '1000px' }}
          className="block"
        />
        
        {/* Boston Highlight Overlay */}
        <svg
          viewBox="0 0 800 500"
          className="absolute inset-0 w-full h-auto pointer-events-none p-12"
          style={{ maxWidth: '1000px', left: '50%', transform: 'translateX(-50%)' }}
        >
          {bostonPos && (
            <g transform={`translate(${bostonPos.x}, ${bostonPos.y})`}>
              <circle r="5" fill="#800000" />
            </g>
          )}
        </svg>
      </motion.div>
    </div>
  );
};

export default USAMap;
