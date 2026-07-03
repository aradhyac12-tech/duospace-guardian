import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Image, Phone, MapPin, Music, Heart, Settings, X, BookOpen, Feather, Clock, Sparkles } from "lucide-react";
import { hapticLight } from "@/lib/haptics";

interface GridMenuProps {
  onClose: () => void;
  // F3, F4: callbacks for chat-specific actions
  onScheduledMessage?: () => void;
  onLoveLetter?: () => void;
}

interface HubButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

export const HubButton = ({ onClick, isOpen }: HubButtonProps) => (
  <button
    onClick={onClick}
    className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0 active:scale-95 transition-transform"
  >
    <motion.div animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.15 }}>
      <Sparkles className="h-4 w-4 text-foreground" />
    </motion.div>
  </button>
);

const navItems = [
  { path: "/gallery", icon: Image, label: "Gallery" },
  { path: "/calls", icon: Phone, label: "Calls" },
  { path: "/map", icon: MapPin, label: "Map" },
  { path: "/playlist", icon: Music, label: "Music" },
  { path: "/shayari", icon: BookOpen, label: "Shayari" },
  { path: "/us", icon: Heart, label: "Us" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

const GridMenu = ({ onClose, onScheduledMessage, onLoveLetter }: GridMenuProps) => {
  const navigate = useNavigate();

  // Action items come first (chat-specific)
  const actionItems = [
    onLoveLetter && { icon: Feather, label: "Love Letter", action: () => { hapticLight(); onLoveLetter(); onClose(); } },
    onScheduledMessage && { icon: Clock, label: "Schedule Send", action: () => { hapticLight(); onScheduledMessage(); onClose(); } },
  ].filter(Boolean) as { icon: React.ElementType; label: string; action: () => void }[];

  const allItems = [...actionItems, ...navItems.map(i => ({
    icon: i.icon,
    label: i.label,
    action: () => { hapticLight(); navigate(i.path); onClose(); },
  }))];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-50"
      onClick={onClose}
    >
      <div className="absolute bottom-[4.25rem] right-3 flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
        <motion.button
          initial={{ opacity: 0, x: 16, scale: 0.92 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 16, scale: 0.92 }}
          transition={{ duration: 0.14 }}
          onClick={onClose}
          className="h-9 w-9 rounded-full bg-card border border-border/50 shadow-lg flex items-center justify-center"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </motion.button>

        <div className="flex flex-col items-end gap-2">
          {allItems.map((item, i) => {
            const Icon = item.icon;
            const isAction = i < actionItems.length;
            return (
              <motion.button
                key={item.label}
                initial={{ opacity: 0, x: 24, scale: 0.92 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.92 }}
                transition={{ delay: i * 0.03, duration: 0.16 }}
                onClick={item.action}
                className={`flex items-center gap-3 rounded-full border shadow-lg px-3 py-2 min-w-[140px] active:scale-95 transition-transform ${
                  isAction
                    ? "bg-foreground border-foreground/20 text-background"
                    : "bg-card border-border/50"
                }`}
              >
                <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${isAction ? "bg-white/10" : "bg-muted"}`}>
                  <Icon className={`h-4 w-4 ${isAction ? "text-background" : "text-foreground"}`} />
                </div>
                <span className={`text-xs font-medium ${isAction ? "text-background" : "text-foreground"}`}>{item.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default GridMenu;
