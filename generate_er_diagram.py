import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os
import shutil

plt.style.use('dark_background')
fig, ax = plt.subplots(figsize=(24, 15), dpi=300)
fig.patch.set_facecolor('#0b0e14')
ax.set_facecolor('#0b0e14')

# Clean layout coordinates (0..100)
# Top area (y=88..100) is reserved for Title, Subtitle, and Legend.
tables = {
    'User': {
        'x': 3, 'y': 38, 'w': 18, 'h': 44,
        'title': 'User', 'tag': 'Identity (Clerk Synced)',
        'color': '#238636', # emerald green
        'cols': [
            ('PK', 'id', 'String'),
            ('UK', 'email', 'String'),
            ('  ', 'name', 'String'),
            ('  ', 'image', 'String'),
            ('  ', 'createdAt', 'DateTime'),
            ('  ', 'updatedAt', 'DateTime'),
        ]
    },
    'WorkspaceMember': {
        'x': 25, 'y': 56, 'w': 20, 'h': 30,
        'title': 'WorkspaceMember', 'tag': 'Junction Table (User ↔ Workspace)',
        'color': '#8957e5', # purple
        'cols': [
            ('PK', 'id', 'UUID'),
            ('FK', 'userId', 'String -> User'),
            ('FK', 'workspaceId', 'String -> Workspace'),
            ('  ', 'role', 'WorkspaceRole'),
            ('  ', 'message', 'String'),
            ('UK', '[userId, workspaceId]', 'Composite Unique'),
        ]
    },
    'ProjectMember': {
        'x': 25, 'y': 16, 'w': 20, 'h': 26,
        'title': 'ProjectMember', 'tag': 'Junction Table (User ↔ Project)',
        'color': '#8957e5', # purple
        'cols': [
            ('PK', 'id', 'UUID'),
            ('FK', 'userId', 'String -> User'),
            ('FK', 'projectId', 'String -> Project'),
            ('UK', '[userId, projectId]', 'Composite Unique'),
        ]
    },
    'Workspace': {
        'x': 49, 'y': 52, 'w': 21, 'h': 36,
        'title': 'Workspace', 'tag': 'Multi-Tenant Root',
        'color': '#1f6feb', # royal blue
        'cols': [
            ('PK', 'id', 'String'),
            ('UK', 'slug', 'String'),
            ('  ', 'name', 'String'),
            ('  ', 'description', 'String?'),
            ('FK', 'ownerId', 'String -> User'),
            ('  ', 'settings', 'Json'),
            ('  ', 'image_url', 'String'),
            ('  ', 'createdAt', 'DateTime'),
            ('  ', 'updatedAt', 'DateTime'),
        ]
    },
    'Project': {
        'x': 49, 'y': 6, 'w': 21, 'h': 40,
        'title': 'Project', 'tag': 'Container for Work',
        'color': '#da3633', # crimson red
        'cols': [
            ('PK', 'id', 'UUID'),
            ('FK', 'workspaceId', 'String -> Workspace'),
            ('FK', 'team_lead', 'String -> User (Owner)'),
            ('  ', 'name', 'String'),
            ('  ', 'description', 'String?'),
            ('  ', 'status', 'ProjectStatus'),
            ('  ', 'priority', 'Priority'),
            ('  ', 'progress', 'Int (0-100%)'),
            ('  ', 'start_date', 'DateTime?'),
            ('  ', 'end_date', 'DateTime?'),
            ('  ', 'createdAt', 'DateTime'),
        ]
    },
    'Task': {
        'x': 75, 'y': 44, 'w': 22, 'h': 44,
        'title': 'Task', 'tag': 'Core Work Item',
        'color': '#d29922', # amber gold
        'cols': [
            ('PK', 'id', 'UUID'),
            ('FK', 'projectId', 'UUID -> Project'),
            ('FK', 'assigneeId', 'String -> User'),
            ('  ', 'title', 'String'),
            ('  ', 'description', 'String?'),
            ('  ', 'status', 'TaskStatus'),
            ('  ', 'type', 'TaskType'),
            ('  ', 'priority', 'Priority'),
            ('  ', 'due_date', 'DateTime'),
            ('  ', 'createdAt', 'DateTime'),
            ('  ', 'updatedAt', 'DateTime'),
        ]
    },
    'Comment': {
        'x': 75, 'y': 10, 'w': 22, 'h': 26,
        'title': 'Comment', 'tag': 'Task Discussion',
        'color': '#388bfd', # sky blue
        'cols': [
            ('PK', 'id', 'UUID'),
            ('FK', 'taskId', 'UUID -> Task'),
            ('FK', 'userId', 'String -> User'),
            ('  ', 'content', 'String'),
            ('  ', 'createdAt', 'DateTime'),
        ]
    }
}

# Draw tables
for tname, t in tables.items():
    x, y, w, h = t['x'], t['y'], t['w'], t['h']
    
    # Outer Card
    card = patches.FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.3,rounding_size=1.0",
        facecolor='#161b22', edgecolor='#30363d', linewidth=1.5,
        zorder=2
    )
    ax.add_patch(card)
    
    # Header box
    hdr_h = 5.2
    header = patches.FancyBboxPatch(
        (x, y + h - hdr_h), w, hdr_h,
        boxstyle="round,pad=0.3,rounding_size=0.8",
        facecolor=t['color'], edgecolor=t['color'], alpha=0.95,
        zorder=3
    )
    ax.add_patch(header)
    
    # Header Text
    ax.text(x + 1.0, y + h - 2.1, t['title'], fontsize=12.5, fontweight='bold', color='white', zorder=4)
    ax.text(x + 1.0, y + h - 3.9, t['tag'], fontsize=8.0, fontstyle='italic', color='#f0f6fc', zorder=4)
    
    # Columns
    num_cols = len(t['cols'])
    avail_h = h - hdr_h - 1.5
    row_h = avail_h / max(num_cols, 1)
    
    for i, (badge, colname, coltype) in enumerate(t['cols']):
        ry = y + h - hdr_h - 1.2 - (i * row_h)
        
        # Badge color
        if badge == 'PK':
            bg_c, text_c = '#9e6a03', '#ffffff'
        elif badge == 'FK':
            bg_c, text_c = '#1f6feb', '#ffffff'
        elif badge == 'UK':
            bg_c, text_c = '#8250df', '#ffffff'
        else:
            bg_c, text_c = '#21262d', '#8b949e'
            
        if badge.strip():
            badge_box = patches.FancyBboxPatch(
                (x + 0.8, ry - 0.7), 2.2, 1.5,
                boxstyle="round,pad=0.15,rounding_size=0.3",
                facecolor=bg_c, edgecolor='none', zorder=3
            )
            ax.add_patch(badge_box)
            ax.text(x + 1.9, ry + 0.05, badge, fontsize=7.0, fontweight='bold', color=text_c, ha='center', va='center', zorder=4)
        
        ax.text(x + 3.4, ry + 0.05, colname, fontsize=9.0, fontweight='bold' if badge.strip() else 'normal', color='#f0f6fc', va='center', zorder=4)
        ax.text(x + w - 0.8, ry + 0.05, coltype, fontsize=8.0, color='#8b949e', ha='right', va='center', zorder=4)
        
        if i < num_cols - 1:
            ax.plot([x + 0.6, x + w - 0.6], [ry - (row_h/2) + 0.1, ry - (row_h/2) + 0.1], color='#21262d', lw=0.7, zorder=3)

# Clean, elegant non-crossing connectors
connectors = [
    # 1. User -> WorkspaceMember (1 : N)
    {
        'pts': [(21, 68), (25, 68)],
        'label': '1 : N', 'c': '#a371f7', 'lbl_pos': (23, 69.5)
    },
    # 2. Workspace -> WorkspaceMember (1 : N)
    {
        'pts': [(49, 70), (45, 70)],
        'label': '1 : N', 'c': '#a371f7', 'lbl_pos': (47, 71.5)
    },
    # 3. User -> Workspace (1 : N Ownership) - Arc over the top
    {
        'arc': True, 'start': (16, 82), 'end': (55, 88), 'rad': -0.22,
        'label': 'owns (1:N)', 'c': '#58a6ff', 'lbl_pos': (33, 91.5)
    },
    # 4. Workspace -> Project (1 : N Contains)
    {
        'pts': [(59.5, 52), (59.5, 46)],
        'label': 'contains (1:N)', 'c': '#3fb950', 'lbl_pos': (62.5, 49)
    },
    # 5. User -> Project (1 : N team_lead) - Straight clean diagonal between the member cards
    {
        'pts': [(21, 48), (49, 36)],
        'label': 'leads (1:N)', 'c': '#f0883e', 'lbl_pos': (33, 44)
    },
    # 6. User -> ProjectMember (1 : N)
    {
        'pts': [(17, 38), (17, 28), (25, 28)],
        'label': '1 : N', 'c': '#bc8cff', 'lbl_pos': (21, 29.5)
    },
    # 7. Project -> ProjectMember (1 : N)
    {
        'pts': [(49, 24), (45, 24)],
        'label': '1 : N', 'c': '#bc8cff', 'lbl_pos': (47, 25.5)
    },
    # 8. Project -> Task (1 : N)
    {
        'pts': [(70, 38), (72.5, 38), (72.5, 62), (75, 62)],
        'label': 'contains (1:N)', 'c': '#d29922', 'lbl_pos': (72.5, 50)
    },
    # 9. User -> Task (1 : N assignee) - Arc along the top boundary
    {
        'arc': True, 'start': (19, 82), 'end': (75, 82), 'rad': -0.16,
        'label': 'assigned to (1:N)', 'c': '#e3b341', 'lbl_pos': (47, 95)
    },
    # 10. Task -> Comment (1 : N)
    {
        'pts': [(86, 44), (86, 36)],
        'label': 'has (1:N)', 'c': '#388bfd', 'lbl_pos': (89.5, 40)
    },
    # 11. User -> Comment (1 : N author) - Clean line along bottom
    {
        'pts': [(12, 38), (12, 4), (75, 4), (75, 14)],
        'label': 'writes (1:N)', 'c': '#79c0ff', 'lbl_pos': (44, 5.5)
    },
]

for conn in connectors:
    c = conn['c']
    if conn.get('arc'):
        arrow = patches.FancyArrowPatch(
            conn['start'], conn['end'],
            connectionstyle=f"arc3,rad={conn['rad']}",
            arrowstyle="-|>,head_width=4,head_length=6",
            color=c, lw=2.0, alpha=0.9, zorder=5
        )
        ax.add_patch(arrow)
    else:
        pts = conn['pts']
        xs, ys = zip(*pts)
        ax.plot(xs, ys, color=c, lw=2.0, alpha=0.9, zorder=5)
        # Add arrow head at the last segment
        ax.annotate('', xy=pts[-1], xytext=pts[-2],
                    arrowprops=dict(arrowstyle="-|>,head_width=0.35,head_length=0.5", color=c, lw=2.0),
                    zorder=5)
        
    lx, ly = conn['lbl_pos']
    ax.text(lx, ly, conn['label'], fontsize=8.2, fontweight='bold', color=c,
            bbox=dict(boxstyle="round,pad=0.25", facecolor='#0b0e14', edgecolor=c, alpha=0.9, lw=1.2),
            ha='center', va='center', zorder=6)

# Title & Subtitle
ax.text(3, 98.5, "Kinetic Multi-Tenant — PostgreSQL ER Diagram", fontsize=21, fontweight='bold', color='#ffffff', va='top')
ax.text(3, 96.0, "Entity-Relationship Model • Relational Multi-Tenant Architecture with Prisma ORM", fontsize=11, color='#8b949e', va='top')

# Legend at top right
legend_items = [
    ('PK: Primary Key', '#9e6a03'),
    ('FK: Foreign Key', '#1f6feb'),
    ('UK: Unique Key', '#8250df'),
    ('1:N Hierarchy', '#3fb950'),
    ('M:N Junction Table', '#bc8cff')
]

for i, (leg_text, leg_color) in enumerate(legend_items):
    lx = 54 + (i * 9.2)
    ax.add_patch(patches.Circle((lx, 97.2), 0.65, facecolor=leg_color, edgecolor='white', lw=0.6, zorder=5))
    ax.text(lx + 1.1, 97.2, leg_text, fontsize=8.2, color='#e6edf3', va='center', zorder=5)

ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis('off')

out_path = 'er_diagram.png'
plt.tight_layout()
plt.savefig(out_path, dpi=300, bbox_inches='tight', facecolor='#0b0e14')
plt.close()

# Also copy to artifact directory
artifact_dir = r"C:\Users\prana\.gemini\antigravity-ide\brain\5a1c68c9-0ca7-4d97-b9d8-ac1e844ec660"
if os.path.exists(artifact_dir):
    shutil.copy(out_path, os.path.join(artifact_dir, 'er_diagram.png'))

print("Refined ER Diagram successfully generated!")
