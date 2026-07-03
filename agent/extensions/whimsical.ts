import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─────────────────────────────────────────────────────────────
// BUILT-IN CONTENT
// ─────────────────────────────────────────────────────────────

const guyaneseQuotes = [
  // Short
  "Liming...",
  "Reasoning...",
  "Macoing...",
  "Hustling by the market...",
  "Heading to the bus park...",
  "Catching a minibus...",
  "Holding a lil vibes...",
  "Cooling out...",
  "Passing through Stabroek...",
  "Swinging by Bourda...",
  "Walking the seawall...",
  "Stopping by the rum shop...",
  "Buying two beers...",
  "Getting some cutters...",
  "Whining pun a ting...",
  "Don't seh 40...",
  "Frying plantain...",
  "Stirring cook-up rice...",
  "Warming pepperpot...",
  "Peeling cassava...",
  "Cutting lime for the drinks...",
  "Filling the igloo cooler...",
  "Looking for a red mango...",
  "Checking on the pot...",
  "Making a market run...",
  "Catching the last car...",
  "Listening for the kiskadees...",
  "Watching the rain clouds...",
  "Waiting till breeze come...",
  "Sharing a small piece...",
  "Saving a plate for later...",
  "Holding strain...",
  "Moving just now...",

  // Long
  "Heading to the bus park and hoping the minibus full up quick...",
  "Liming by Stabroek and talking bare nonsense...",
  "Stopping by the rum shop and buying two cold beers...",
  "Getting some cutters because the drinks cyan go down so plain...",
  "Whining pun a ting like the speaker hit the right tune...",
  "Trying hard not to seh 40 and still nearly letting it slip...",
  "Making a quick market run before the rain start fall...",
  "Walking the seawall and catching a proper evening breeze...",
  "Checking if the pot done before everybody start asking for food...",
  "Saving a lil cook-up rice because somebody always coming over...",
  "Warming pepperpot like it tasting even better the next day...",
  "Passing through Bourda and trying not to buy more than planned...",
  "Waiting on the bus and watching everybody else hustle through...",
  "Cooling out under the gallery till the heat ease up...",
  "Cutting lime and setting up drinks for the whole set...",
  "Listening to old stories that start with 'leh me tell yuh'...",
  "Holding a corner by the shop and catching up on everything missed...",
  "Trying to leave the lime but one more story keep starting...",
  "Watching the road flood a lil and still planning how to get through...",
  "Packing up snacks like the trip gon' take all day...",
  "Looking for the best plantain and pretending it is a quick stop...",
  "Waiting till everybody ready, which means waiting plenty longer...",
  "Moving just now, but first taking one last small sit-down...",

  // Proverbs
  "All cassava get same skin but all nah taste same way...",
  "Baby who ah cry ah house and ah door ah same thing...",
  "Belly full behind drunk...",
  "Big tree fall down, goat bite he leaf...",
  "Bush get ears and dutty get tongue...",
  "Cat foot soft but he ah scratch bad...",
  "Cuss when yuh ah guh, nah wheh yuh ah come out...",
  "Contrary breeze ah mek crow and eagle light on one line...",
  "Cow deh a pasture he nah remember seh dog and butcher deh till he see am...",
  "Cat a ketch rat, but he a teef he massa fish...",
  "Clath ah easy fuh dutty but hard fuh wash...",
  "Dah mouth dat man tek fuh court woman, ah de same mouth he ah tek an put she ah door...",
  "Don't mind how bird vex, it can't vex with tree...",
  "Dog buy rum, cow drink am, hog in sty get drunk...",
  "Every rope gat two ends...",
  "Every fowl feed pon he own craw...",
  "Every best friend get a next best friend...",
  "Every bush a man night time...",
  "Fish ah deh ah watah but nah ah dam tap...",
  "Fish ah play ah sea, he nah know watah ah boil fuh am...",
  "Fish and cast-net nah friend...",
  "Good gubby nah ah float ah tap...",
  "Hungry nah know bam-by...",
  "If yuh finger get sore, nah tek am and throw way...",
  "If yuh eye nah see, yuh mouth nah must talk...",
  "If cow-man pass wild meat whah mek me must pick up am...",
  "It nah good to shove yuh foot in every stocking...",
  "If me bin know always deh behind de door...",
  "If yuh nah get wing, nah ah guh a bird sport...",
  "If dutty ah deh ah roof tap, yuh barrel ah catch am...",
  "If oil ah float watah deh ah battam...",
  "If yuh plant plantain yuh can't reap cassava...",
  "If trousers say massah teef, yuh can't doubt am...",
  "Lil finger point to de big thumb and sey nah guh...",
  "Lil boy nah climb ladder to turn big man...",
  "Lil ah sick, big a get better...",
  "Man strength deh ah he hand, woman strength deh a she mouth...",
  "Mouth cut trousers nah ah fit Massa...",
  "Macaw ask parrot if mango ripe, he say one, one...",
  "Moon ah run till daylight ketch am...",
  "Nah all who guh a church house ah guh fuh pray...",
  "Nah tek yuh mattie eye fuh see...",
  "Nah one time a fire mek peas boil...",
  "Nah because dog ah play with yuh he nah bite yuh...",
  "Nah every crab hole get crab...",
  "Nah every big head get sense...",
  "Nah mind how pumpkin vine run, he must dry up one day...",
  "Nah put all two foot in river if yuh want see how he deep...",
  "Nah everything scholar know he learn from teacher...",
  "Never guh a store ah night fuh buy black cloth...",
  "No good carpenter does get good wuk bench...",
  "Nobody want dutty powder...",
  "One man money mek too much man cry...",
  "One kiss nah done lips...",
  "Orange yellow but yuh nah know if he sweet...",
  "Only knife ah know whah in pumpkin belly...",
  "Rain ah fall ah roof yuh put barrel fuh ketch am...",
  "Shame face ah feel like cent ice...",
  "Some pork-knockers does only clear track fuh monkey run race...",
  "Seven years nah too much fuh wash speck off ah bird neck...",
  "Slow fire ah boil hard cow-heel...",
  "Tongue nah gat teeth but he ah bite fuh true...",
  "Turtle can't walk if he nah push he head outa he shell...",
  "Turtle nah want trouble mek he walk with he house pon he back...",
  "Too much sit down ah bruck trousers...",
  "The looks ah de pudding is not de taste...",
  "Vice nah hurt but conscience ah hurt yuh...",
  "Vex nah gat plaster fuh passion...",
  "Wasteful man money ah guh like butter in de sun...",
  "When man mek heself sugar he mattie ah suck am...",
  "When yuh buy ah dutty calico yuh gat fuh wear am till it tear...",
  "When yuh play out all yuh trump cards yuh gat to lose till game done...",
  "When yuh dead yuh nah sabee, and when yuh sabee yuh dead...",
  "When man done suck cane he dash peeling pan ground...",
  "When Mumma dead family done...",
  "When dog hungry he ah nyam calabash...",
  "When gaulding see fish he forget seh gun deh...",
  "When yuh deh in bad luck wet paper self ah cut yuh...",
  "When water throw away ah ground yuh can't pick am up...",
  "When coconut fall from tree he can't fasten back...",
  "When two big bottle deh ah table lil one nah business deh...",
  "Whah hurt eye does mek nose run water...",
  "When you want fuh swim river yuh gat fuh plunge inside fuss...",
  "Yuh tel tara and tara tell tara...",
  "Youth nah ah weary but he ah fall down...",
  "Yuh can't chew bone with gum...",
  "Yuh can't fatten cow fuh another man butcher...",
  "Yuh can't drink mauby and belch beer...",
  "Yuh can't suck cane and blow whistle...",
  "Yuh gat fuh blow yuh nose where yuh stump yuh toe...",
  "One, one dutty build dam...",
  "Dance a battam watch a tap...",
  "Never cuss bridge that you cross...",
  "Monkey dress e pickney till he spoil...",
  "All skin teeth nah laugh...",
];

const techTips = [
  "sudo -i — Become root. Escape your user sandbox entirely.",
  "htop > top — Better process viewer. Color, tree view, per-CPU breakdown.",
  "watch -n 1 cmd — Repeat any command every second. Monitor live stats.",
  "ctrl+r — Reverse search through bash history. Find old commands fast.",
  "nohup cmd & — Run command that survives terminal close. Stdout to nohup.out.",
  "tar -czvf archive.tar.gz dir/ — Compress directory to .tar.gz. -x to extract.",
  "ssh -L 8080:localhost:80 — Local port forward. Tunnel remote service to your machine.",
  "grep -r --include='*.py' 'TODO' . — Recursive search with file filter. Find things fast.",
  "chmod +x script.sh — Add execute permission. Required before running scripts.",
  "df -h — Disk usage in human-readable. Check storage before it fills up.",
  "du -sh * — Size of each item in current directory. Find space hogs.",
  "curl -I url — Show headers only. Check HTTP response without downloading body.",
  "netstat -tulpn — Listening ports and processes. Find what's running where.",
  "ss -tlnp — Modern replacement for netstat. Faster, shows socket state.",
  "strace -p PID — Trace system calls of running process. Debug what's it doing.",
  "lsof -i :8080 — Find process using port 8080. Kill by PID when needed.",
  "rsync -avP src/ dest/ — Sync files preserving permissions. Resume interrupted transfers.",
  "tmux — Terminal multiplexer. Multiple panes, sessions, persistent shells.",
  "watchexec cmd — Run command when files change. Dev workflow essential.",
  "jq '.key' file.json — Query JSON from CLI. Transform, filter, pretty-print.",
  "awk '{print $2}' file — Extract column from text. Pattern scanning and processing.",
  "sed -i 's/foo/bar/g' file — Replace text in-place. Global substitution across file.",
  "xargs -I {} cmd {} — Pass input as argument to command. Build pipelines.",
  "diff -u old new — Unified diff. Readable output for code review.",
  "crontab -e — Edit scheduled tasks. Format: minute hour day month weekday command.",
  "systemctl status svc — Check service status. journalctl -u svc for logs.",
  "ln -s target link — Create symbolic link. Shortcut to deep paths.",
  "find . -mtime -7 — Find files modified in last 7 days. Many -type, -size, -name variants.",
  "wc -l file — Count lines. Quick way to gauge file size.",
  "head -n 20 file — First 20 lines. Preview large files without loading all.",
  "tail -f logfile — Follow file in real-time. Watch logs as they write.",
  "md5sum file — Quick checksum. Verify file integrity after copy or download.",
  "gpg -c file — Encrypt file with password. Simple symmetric encryption.",
  "ssh-keygen -t ed25519 — Generate modern SSH key. More secure than RSA.",
  "scp file user@host:/path — Secure copy over SSH. Network file transfer.",
  "mount /dev/sdb1 /mnt/usb — Mount filesystem. Umount before unplugging.",
  "lsblk — List block devices. See drives, partitions, mount points.",
  "fdisk -l — View partition table. See all disks and sizes.",
  "mkfs.ext4 /dev/sdb1 — Create ext4 filesystem. Choose FS type for your use case.",
  "fsck /dev/sda1 — Filesystem check and repair. Unmount first.",
  "tar -tf archive.tar — List contents without extracting. Preview before unpacking.",
  "dd if=input of=output — Raw disk copy. Use bs=4M for speed. Caution: destructive.",
  "iotop — I/O usage per process. Find what's hammering the disk.",
  "iftop — Network bandwidth per connection. Real-time traffic monitor.",
  "nethogs — Per-process network usage. Find which app is eating bandwidth.",
  "tcpdump -i any port 80 — Capture packets. Protocol analysis, debugging connections.",
  "wireshark — Deep packet inspection. GUI for tcpdump analysis.",
  "dig domain — DNS lookup. More detail than nslookup, shows all records.",
  "nslookup domain — Quick DNS query. Check how domain resolves.",
  "route -n — Kernel routing table. See where traffic is going.",
  "iptables -L — List firewall rules. Affects incoming/outgoing packets.",
  "ufw allow 22/tcp — Simple firewall. Ubuntu's uncomplicated interface to iptables.",
  "fail2ban — Ban IPs after failed login attempts. Brute force protection.",
  "openssl req -new -x509 -nodes -days 365 -keyout key.pem -out cert.pem — Generate self-signed cert.",
  "certbot — Let's Encrypt automation. Free HTTPS certificates.",
  "systemd-analyze critical-chain — Boot time analysis. Find slow services.",
  "journalctl --since '1 hour ago' — Logs since timestamp. Filter syslog.",
  "dmesg | less — Kernel ring buffer. Boot messages, hardware detection.",
  "lspci — List PCI devices. See graphics card, network adapters.",
  "lsusb — List USB devices. Find connected hardware.",
  "dmidecode — Hardware info. BIOS details, serial numbers, memory slots.",
  "free -h — Memory usage. Total, used, free, swap.",
  "uptime — System running time and load average. 1, 5, 15 minute averages.",
  "uname -a — Kernel version and system info. Know what you're running.",
  "hostname -I — Get IP addresses. All interfaces, no hostname lookup.",
  "ping -c 4 host — Test connectivity. Measures latency, check if host reachable.",
  "mtr host — Traceroute with ping. Combined latency and path analysis.",
  "traceroute host — Show network path to host. Each hop and its latency.",
  "nc -zv host port — Test port connectivity. Check if firewall blocking.",
  "curl url — Fetch HTTP content. -X POST, -H headers, -d data for API work.",
  "wget -r -l 2 url — Recursive download. Crawl site to local copy.",
  "aria2c -x 4 url — Multi-threaded download. Faster than wget/curl single thread.",
  "zip -r archive.zip dir/ — Create zip archive. -r for recursion.",
  "tmux new -s name — Named session. Reattach with tmux attach -t name.",
  "ssh-copy-id user@host — Copy SSH key to remote. Password-free login setup.",
  "mosh user@host — Mobile-friendly SSH. Works through NAT, survives reconnection.",
  "rsync -avz --delete src/ dest/ — Mirror directories. --delete removes extraneous files.",
  "screen -S name — Named screen session. Like tmux but older.",
  "fg, bg, jobs, ctrl+z — Job control. Suspend, background, foreground processes.",
  "nohup ./script.sh > output.log 2>&1 & — Background job with output logging.",
  "pkill -f processname — Kill by process name. Match against full command line.",
  "nice -n 10 cmd — Run with lower priority. Higher nice = lower priority.",
  "renice 10 -p PID — Change priority of running process. Resource sharing.",
  "cgroups — Control groups. Limit CPU/memory per service. Container foundation.",
  "docker stats — Container resource usage. CPU, memory, network, disk I/O.",
  "docker exec -it container sh — Shell into running container. Debug live apps.",
  "kubectl get pods — List Kubernetes pods. -o wide for more detail.",
  "helm install chart — Deploy Kubernetes app from Helm chart. Package manager.",
  "terraform plan — Preview infrastructure changes. Apply when satisfied.",
  "ansible-playbook site.yml — Run playbook. Idempotent server configuration.",
  "puppet agent --test — Pull configuration from puppet master. Agent-based.",
  "tail -n 100 /var/log/syslog — Recent system logs. /var/log/auth.log for auth attempts.",
  "last — Show last logged in users. lastb for failed attempts.",
  "who — Who's logged in now. Shows terminal, time, origin.",
  "w — Who's doing what. More detail than who.",
  "wall 'message' — Broadcast to all terminals. Emergency announcements.",
  "shutdown -h now — Halt and power off. -r for reboot.",
  "init 0/3/5/6 — Change runlevel. 0 halt, 3 multiuser, 5 graphical, 6 reboot.",
  "udevadm monitor — Monitor device events. Hardware hotplug debugging.",
  "lvm — Logical Volume Manager. Flexible partition resizing, snapshots.",
  "btrfs subvolume — Copy-on-write filesystem. Snapshots, compression, checksums.",
  "zfs — Enterprise filesystem. Compression, replication, snapshots all built in.",
  "strace -c cmd — Count syscalls. Profile which system calls program makes.",
  "perf top — Real-time CPU profiler. Find hot code paths.",
  "valgrind --leak-check=yes ./prog — Memory leak detector. Essential for C/C++.",
  "gdb ./binary — GNU debugger. Step through code, inspect memory, breakpoints.",
  "nm binary — List symbols. See functions and variables in compiled binary.",
  "objdump -d binary — Disassemble. See assembly of compiled code.",
  "strings file — Extract printable strings from binary. Often reveals embedded config.",
  "xxd file — Hex dump. View binary file contents.",
  "dd if=/dev/urandom of=file bs=1M count=100 — Create random file. For testing.",
  "base64 file — Encode/decode base64. Encode for embedding, decode for reading.",
  "shred -u file — Secure delete. Overwrite before removing.",
  "trap 'cleanup' EXIT — Run cleanup on script exit. Ensure temp files removed.",
  "set -e — Exit on error. Script stops if any command fails.",
  "set -x — Debug mode. Print each command before execution.",
  "${VAR:-default} — Use default if VAR unset. Parameter expansion.",
  "VAR=$(command) — Command substitution. Capture output into variable.",
  "read -p 'Prompt: ' var — Read user input. -s for silent (passwords).",
  "select option in a b c; do echo $option; done — Interactive menu. Bash builtin.",
  "getopts :ab:c — Parse short options. Handle -a -b arg -c style flags.",
  "here document — cat <<EOF ... EOF. Inline multi-line input.",
  "process substitution — diff <(cmd1) <(cmd2). Feed command output as file.",
  "xargs -0 — Null-separated input. Handle filenames with spaces safely.",
  "parallel cmd ::: list — Run commands in parallel. Much faster than loop.",
];

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────

interface WhimsicalState {
  messages: string[];
}

function buildState(): WhimsicalState {
  return {
    messages: [...guyaneseQuotes, ...techTips],
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function pickRandom(state: WhimsicalState): string {
  return state.messages[Math.floor(Math.random() * state.messages.length)];
}

// ─────────────────────────────────────────────────────────────
// EXTENSION
// ─────────────────────────────────────────────────────────────

let state = buildState();

export default function (pi: ExtensionAPI) {
  async function refreshFromAPI() {
    try {
      const res = await fetch("https://api.datamuse.com/words?sp=*&md=d&max=100");
      if (!res.ok) return;
      
      const words = await res.json() as Array<{ word: string; defs?: string[] }>;
      
      const freshWords = words
        .filter(w => w.defs && w.defs.length > 0)
        .slice(0, 30)
        .map(w => {
          const def = w.defs![0].replace(/^\w+\s+/, '');
          return `${w.word} — ${def}`;
        });

      if (freshWords.length > 0) {
        const shuffled = freshWords.sort(() => Math.random() - 0.5);
        state.messages = [...guyaneseQuotes, ...techTips, ...shuffled];
      }
    } catch {
      // Fall back to built-in content silently
    }
  }

  async function refreshFromBuiltIn() {
    state = buildState();
  }

  pi.registerCommand("refresh-whimsical", {
    description: "Refresh whimsical messages. Use --api to fetch fresh words.",
    handler: async (args: string, ctx) => {
      if (args.includes("--api")) {
        await refreshFromAPI();
      } else {
        await refreshFromBuiltIn();
      }
    },
  });

  // Load built-in content immediately, fetch API words in background
  refreshFromBuiltIn();
  refreshFromAPI();

  pi.on("turn_start", async (_event, ctx) => {
    ctx.ui.setWorkingMessage(pickRandom(state));
  });

  pi.on("turn_end", async (_event, ctx) => {
    ctx.ui.setWorkingMessage();
  });
}