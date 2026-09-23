using UnityEngine;

namespace BetterQuest3
{
    public class SpawnStation : MonoBehaviour
    {
        public Vector3 spawnPosition;

        float cooldown;

        void Update()
        {
            cooldown -= Time.deltaTime;

            // Editor fallback: press Space to spawn.
            if (Input.GetKeyDown(KeyCode.Space) && cooldown <= 0)
            {
                SpawnCube();
                cooldown = 0.25f;
            }
        }

        public void SpawnCube()
        {
            if (cooldown > 0) return;

            var g = GameObject.CreatePrimitive(PrimitiveType.Cube);
            g.name = "Spawned Cube";
            g.transform.position = spawnPosition;
            g.transform.localScale = Vector3.one * 0.45f;

            var rb = g.AddComponent<Rigidbody>();
            rb.mass = 1f;

            g.AddComponent<Grabbable>();
            g.AddComponent<PhysicsImpact>();

            cooldown = 0.25f;
        }
    }
}
