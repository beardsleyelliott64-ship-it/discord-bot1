using UnityEngine;
using UnityEngine.UI;

namespace BetterQuest3
{
    public static class SandboxWorld
    {
        public static void Create()
        {
            CreateLighting();
            CreateFloor();
            CreateWalls();
            CreateProps();
            CreateSpawnStation();
            CreateMenu();
        }

        static Material Mat(Color c, float metallic = 0f, float smooth = 0.35f)
        {
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            m.color = c;
            m.SetFloat("_Metallic", metallic);
            m.SetFloat("_Smoothness", smooth);
            return m;
        }

        static GameObject Cube(string name, Vector3 pos, Vector3 scale, Color color)
        {
            var g = GameObject.CreatePrimitive(PrimitiveType.Cube);
            g.name = name;
            g.transform.SetPositionAndRotation(pos, Quaternion.identity);
            g.transform.localScale = scale;
            g.GetComponent<Renderer>().material = Mat(color);
            return g;
        }

        static GameObject Sphere(string name, Vector3 pos, float radius, Color color)
        {
            var g = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            g.name = name;
            g.transform.position = pos;
            g.transform.localScale = Vector3.one * radius * 2f;
            g.GetComponent<Renderer>().material = Mat(color, 0.05f, 0.5f);
            return g;
        }

        static GameObject PhysicsCube(string name, Vector3 pos, Color color)
        {
            var g = Cube(name, pos, Vector3.one * 0.35f, color);
            var rb = g.AddComponent<Rigidbody>();
            rb.mass = 1f;
            g.AddComponent<Grabbable>();
            g.AddComponent<PhysicsImpact>();
            return g;
        }

        static GameObject PhysicsSphere(string name, Vector3 pos, Color color)
        {
            var g = Sphere(name, pos, 0.25f, color);
            var rb = g.AddComponent<Rigidbody>();
            rb.mass = 0.8f;
            g.AddComponent<Grabbable>();
            g.AddComponent<PhysicsImpact>();
            return g;
        }

        static void CreateLighting()
        {
            var sun = new GameObject("Quest Sun");
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.15f;
            sun.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            RenderSettings.ambientIntensity = 0.65f;
        }

        static void CreateFloor()
        {
            Cube("Sandbox Floor", new Vector3(0, -0.15f, 0),
                new Vector3(14, 0.3f, 14), new Color(0.08f, 0.09f, 0.11f));
        }

        static void CreateWalls()
        {
            Cube("North Wall", new Vector3(0, 2, 7),
                new Vector3(14, 4, 0.25f), new Color(0.12f, 0.13f, 0.16f));
            Cube("South Wall", new Vector3(0, 2, -7),
                new Vector3(14, 4, 0.25f), new Color(0.12f, 0.13f, 0.16f));
            Cube("East Wall", new Vector3(7, 2, 0),
                new Vector3(0.25f, 4, 14), new Color(0.12f, 0.13f, 0.16f));
            Cube("West Wall", new Vector3(-7, 2, 0),
                new Vector3(0.25f, 4, 14), new Color(0.12f, 0.13f, 0.16f));
        }

        static void CreateProps()
        {
            for (int i = 0; i < 12; i++)
            {
                float x = -3.5f + (i % 4) * 2.3f;
                float z = -2f + (i / 4) * 1.4f;
                PhysicsCube("Box_" + i, new Vector3(x, 0.5f, z),
                    new Color(0.25f + i * 0.025f, 0.45f, 0.8f));
            }

            for (int i = 0; i < 8; i++)
                PhysicsSphere("Ball_" + i,
                    new Vector3(-4f + i * 1.1f, 1.2f, 3.0f),
                    new Color(0.8f, 0.35f + i * 0.04f, 0.3f));
        }

        static void CreateSpawnStation()
        {
            var station = Cube("Spawn Station", new Vector3(4.8f, 1.1f, 4.8f),
                new Vector3(2f, 2.2f, 1f), new Color(0.05f, 0.25f, 0.35f));
            var spawner = station.AddComponent<SpawnStation>();
            spawner.spawnPosition = station.transform.position + Vector3.up * 1.4f;
        }

        static void CreateMenu()
        {
            var canvas = new GameObject("Sandbox Menu");
            var c = canvas.AddComponent<Canvas>();
            c.renderMode = RenderMode.WorldSpace;
            canvas.transform.position = new Vector3(0, 2.3f, 4.8f);
            canvas.transform.localScale = Vector3.one * 0.0025f;

            var panel = new GameObject("Panel");
            panel.transform.SetParent(canvas.transform, false);
            var image = panel.AddComponent<Image>();
            image.color = new Color(0.025f, 0.03f, 0.045f, 0.94f);
            var rect = panel.GetComponent<RectTransform>();
            rect.sizeDelta = new Vector2(900, 420);

            var textObj = new GameObject("Title");
            textObj.transform.SetParent(panel.transform, false);
            var text = textObj.AddComponent<Text>();
            text.text = "BETTER QUEST SANDBOX\n\nPHYSICS LAB\nGrab objects • Throw • Build\nUse the spawn station on the right";
            text.alignment = TextAnchor.MiddleCenter;
            text.fontSize = 52;
            text.color = Color.white;
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var tr = text.GetComponent<RectTransform>();
            tr.anchorMin = Vector2.zero;
            tr.anchorMax = Vector2.one;
            tr.offsetMin = new Vector2(35, 35);
            tr.offsetMax = new Vector2(-35, -35);
        }
    }
}
