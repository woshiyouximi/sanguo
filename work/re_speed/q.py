"""Ad-hoc query helper for the re_speed investigation.

Usage:  python q.py x <hexva> <count>
        python q.py m94
"""
import sys
import rs


def dump(va, n, title=None):
    if title:
        print("=== %s ===" % title)
    rs.dis(va, n)
    print()


def main():
    t = sys.argv[1] if len(sys.argv) > 1 else "all"
    if t == "x":
        dump(int(sys.argv[2], 16), int(sys.argv[3]), None)
    elif t == "m94":
        r = rs.find_mem(0x94)
        print("disp 0x94 count", len(r))
        for x in r:
            print("%08x %-6s %s" % (x[0], x[2], x[3]))


if __name__ == "__main__":
    main()
