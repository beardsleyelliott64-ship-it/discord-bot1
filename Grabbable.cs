using UnityEngine;

namespace BetterQuest3
{
    [RequireComponent(typeof(Rigidbody))]
    public class Grabbable : MonoBehaviour
    {
        Rigidbody body;
        Transform target;

        public void Grab(Transform hand)
        {
            target = hand;
            body = GetComponent<Rigidbody>();
            body.isKinematic = true;
        }

        public void Release(Vector3 velocity, Vector3 angularVelocity)
        {
            if (body == null) body = GetComponent<Rigidbody>();
            target = null;
            body.isKinematic = false;
            body.linearVelocity = velocity;
            body.angularVelocity = angularVelocity;
        }

        void FixedUpdate()
        {
            if (target == null) return;
            body.MovePosition(target.position);
            body.MoveRotation(target.rotation);
        }
    }
}
